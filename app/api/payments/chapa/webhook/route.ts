import { createHash } from "node:crypto";
import { payoutConfiguration } from "../../../../../lib/nexride-payouts";
import {
  reconcilePayPayout,
  type PayPayout,
} from "../../../../../lib/biloo-pay-payout-server";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
  paymentConfiguration,
  validChapaWebhookSignature,
  verifyChapaPayment,
} from "../../../../../lib/nexride-payments";
import {
  payError,
  payReply,
  payRpc,
  readPayBody,
  requirePayReady,
} from "../../../../../lib/biloo-pay-server";

export async function POST(request: Request) {
  if (!paymentConfiguration().enabled && !payoutConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const raw = await readPayBody(request);
    // Only the body-bound signature is accepted; the legacy static secret hash is replayable.
    if (
      !validChapaWebhookSignature(raw, request.headers.get("x-chapa-signature"))
    )
      return payReply({ status: "invalid_signature" }, 401);
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return payReply({ status: "invalid" }, 400);
    }
    if (!event || typeof event !== "object" || Array.isArray(event))
      return payReply({ status: "invalid" }, 400);
    const admin = serverAdminSupabase();
    await requirePayReady(admin);
    const txRef =
      typeof event.tx_ref === "string"
        ? event.tx_ref
        : typeof event.reference === "string"
          ? event.reference
          : "";
    const kind = typeof event.event === "string" ? event.event : "unknown";
    const digest = createHash("sha256").update(raw).digest("hex");
    const record = (state: string) =>
      payRpc(admin, "biloo_pay_record_webhook_server", {
        p_digest: digest,
        p_tx_ref: txRef,
        p_event: kind,
        p_state: state,
      });
    await record("received");
    if (kind.startsWith("payout.")) {
      if (!payoutConfiguration().enabled) {
        await record("retry");
        return payReply({ status: "verification_pending" }, 503);
      }
      const payout = await payRpc<PayPayout>(
        admin,
        "biloo_pay_payout_reference_server",
        { p_ref: txRef },
      );
      if (!payout) {
        await record("ignored");
        return payReply({ status: "ignored" });
      }
      if (event.mode !== payout.mode || event.currency !== "ETB") {
        await record("rejected");
        return payReply({ status: "provider_mismatch" }, 409);
      }
      if (
        kind.includes("revers") ||
        kind.includes("refund") ||
        (payout.status === "paid" && kind.includes("fail")) ||
        (payout.status === "failed" && kind.includes("success"))
      ) {
        await record("review");
        return payReply({ status: "review_required" });
      }
      const state = await reconcilePayPayout(admin, payout).catch(
        () => "verification_required",
      );
      if (state !== "paid" && state !== "failed") {
        await record("retry");
        return payReply({ status: "verification_pending" }, 503);
      }
      await record("processed");
      return payReply({ status: state });
    }
    // Refund/reversal events never enter the payment-success path.
    if (kind !== "charge.success" || !/^biloo-[a-f0-9-]{36}$/.test(txRef)) {
      if (kind.includes("refund") || kind.includes("revers")) {
        const tracked = await payRpc(admin, "biloo_pay_attempt_server", {
          p_tx_ref: txRef,
        });
        if (
          !tracked ||
          event.mode !== tracked.mode ||
          event.currency !== "ETB"
        ) {
          await record("rejected");
          return payReply({ status: "provider_mismatch" }, 409);
        }
        await payRpc(admin, "biloo_pay_provider_review_server", {
          p_tx_ref: txRef,
          p_event: kind,
          p_digest: digest,
        });
      }
      await record(
        kind.includes("refund") || kind.includes("revers")
          ? "rejected"
          : "ignored",
      );
      return payReply({ status: "review_required" });
    }
    const attempt = await payRpc(admin, "biloo_pay_attempt_server", {
      p_tx_ref: txRef,
    });
    if (!attempt) {
      await record("ignored");
      return payReply({ status: "ignored" });
    }
    if (event.mode !== attempt.mode || event.currency !== "ETB") {
      await record("rejected");
      return payReply({ status: "provider_mismatch" }, 409);
    }
    const verified = await verifyChapaPayment({
      txRef,
      amount: Number(attempt.amount_minor) / 100,
      mode: attempt.mode as "live" | "test",
    }).catch(() => null);
    if (!verified?.evidence) {
      await record("retry");
      // Chapa retries non-200 deliveries. Never acknowledge an unresolved payment as processed.
      return payReply({ status: "verification_pending" }, 503);
    }
    await payRpc(admin, "biloo_pay_settle_chapa_server", {
      p_id: attempt.id,
      p_evidence: verified.evidence,
    });
    await record("processed");
    return payReply({ status: "paid" });
  } catch (error) {
    return payError(error);
  }
}

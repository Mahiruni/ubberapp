import { createHash } from "node:crypto";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { paymentConfiguration, validChapaWebhookSignature, verifyChapaPayment } from "../../../../../lib/nexride-payments";
import { payoutConfiguration, verifyChapaPayout } from "../../../../../lib/nexride-payouts";

type Webhook = {
  webhook_type?: unknown;
  event?: unknown;
  mode?: unknown;
  status?: unknown;
  currency?: unknown;
  amount?: unknown;
  merchant_reference?: unknown;
  chapa_reference?: unknown;
  updated_at?: unknown;
};

const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const result = (status: string, code = 200) =>
  Response.json({ status }, { status: code, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const paymentConfig = paymentConfiguration();
  const payoutConfig = payoutConfiguration();
  if (!paymentConfig.enabled && !payoutConfig.enabled) return result("not_configured", 503);

  const rawBody = await request.text();
  if (rawBody.length > 131072) return result("payload_too_large", 413);
  if (!validChapaWebhookSignature(rawBody, request.headers.get("x-chapa-signature")))
    return result("invalid_signature", 401);

  let event: Webhook;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("invalid");
    event = parsed as Webhook;
  } catch { return result("invalid_payload", 400); }

  const type = text(event.webhook_type);
  const mode = text(event.mode);
  const merchantReference = text(event.merchant_reference);
  const chapaReference = text(event.chapa_reference);
  const eventType = text(event.event);
  if ((type !== "payment" && type !== "payout") ||
      !merchantReference || !chapaReference || !eventType ||
      event.currency !== "ETB" || (mode !== "test" && mode !== "live")) {
    // Refunds need a dedicated refund reconciliation workflow: never mark them paid.
    return result("ignored");
  }
  const activeConfig = type === "payment" ? paymentConfig : payoutConfig;
  const keyMode = (process.env.CHAPA_SECRET_KEY || process.env.PAYMENT_SECRET_KEY || "")
    .startsWith("CHAPA_LIVE_") ? "live" : "test";
  if (!activeConfig.enabled || mode !== keyMode) return result("mode_mismatch", 409);

  const amount = typeof event.amount === "number" ? event.amount : Number(event.amount);
  if (!Number.isFinite(amount) || amount <= 0) return result("invalid_amount", 400);

  const admin = serverAdminSupabase();
  const eventKey = createHash("sha256")
    .update([type, mode, eventType, merchantReference, chapaReference, text(event.updated_at)].join("|"))
    .digest("hex");
  const { data: recorded, error: recordError } = await admin
    .from("payment_webhook_events")
    .upsert({
      event_key: eventKey,
      provider: "chapa",
      event_type: eventType,
      merchant_reference: merchantReference,
      chapa_reference: chapaReference,
      provider_mode: mode,
    }, { onConflict: "event_key", ignoreDuplicates: true })
    .select("processing_status")
    .maybeSingle();
  if (recordError) return result("event_record_failed", 500);
  if (recorded?.processing_status === "processed") return result("already_processed");

  if (type === "payment") {
    const { data: transaction, error } = await admin
      .from("payment_transactions")
      .select("id,ride_request_id,provider_tx_ref,provider_reference,amount_etb,status")
      .eq("provider", "chapa")
      .eq("provider_tx_ref", merchantReference)
      .maybeSingle();
    if (error) return result("transaction_lookup_failed", 500);
    if (!transaction) return result("transaction_not_found", 404);
    if (Math.round(Number(transaction.amount_etb) * 100) !== Math.round(amount * 100))
      return result("amount_mismatch", 409);

    if (transaction.provider_reference && transaction.provider_reference !== chapaReference)
      return result("reference_mismatch", 409);

    const verified = await verifyChapaPayment({
      txRef: merchantReference,
      amount: Number(transaction.amount_etb),
      chapaReference,
    }).catch(() => null);
    if (!verified || verified.state === "unverified" || verified.state === "pending")
      return result("awaiting_verification", 202);

    if (verified.state === "paid") {
      const { error: paidError } = await admin.rpc("mark_payment_paid_server", {
        p_transaction_id: transaction.id,
        p_provider_reference: verified.reference,
        p_provider_payload: verified.providerPayload || {},
      });
      if (paidError) return result("payment_reconciliation_required", 500);
    } else if (transaction.status !== "paid") {
      const { error: failedError } = await admin.from("payment_transactions")
        .update({
          status: "failed",
          provider_reference: chapaReference,
          verified_at: new Date().toISOString(),
          provider_payload: verified.providerPayload || {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id)
        .in("status", ["initialized", "pending"]);
      if (failedError) return result("payment_update_failed", 500);
    }
  } else {
    const { data: payout, error } = await admin
      .from("driver_payout_requests")
      .select("id,provider_reference,amount_etb,status")
      .eq("provider", "chapa")
      .eq("provider_reference", merchantReference)
      .maybeSingle();
    if (error) return result("payout_lookup_failed", 500);
    if (!payout) return result("payout_not_found", 404);
    if (Math.round(Number(payout.amount_etb) * 100) !== Math.round(amount * 100))
      return result("amount_mismatch", 409);
    const verified = await verifyChapaPayout(chapaReference, Number(payout.amount_etb), merchantReference)
      .catch(() => null);
    if (!verified || verified.state === "not_found") return result("awaiting_verification", 202);
    if (verified.state !== "processing" && payout.status !== "paid") {
      const { error: finalizeError } = await admin.rpc("finalize_driver_payout_server", {
        p_request_id: payout.id,
        p_status: verified.state === "paid" ? "paid" : "failed",
        p_provider_payload: verified.providerSummary,
        p_failure_reason: verified.state === "failed" ? "Provider rejected or reversed payout" : null,
      });
      if (finalizeError) return result("payout_reconciliation_required", 500);
    }
  }

  const { error: updateError } = await admin.from("payment_webhook_events")
    .update({ processing_status: "processed", processed_at: new Date().toISOString() })
    .eq("event_key", eventKey);
  if (updateError) return result("event_finalize_failed", 500);
  return result("processed");
}

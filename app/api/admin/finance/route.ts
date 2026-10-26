import {
  payAccess,
  payBody,
  payError,
  payReply,
  payRpc,
} from "../../../../lib/biloo-pay-server";
import { payUuid } from "../../../../lib/biloo-pay-money";
import {
  verifyChapaPayment,
  paymentConfiguration,
} from "../../../../lib/nexride-payments";
import { payoutConfiguration } from "../../../../lib/nexride-payouts";
import {
  reconcilePayPayout,
  type PayPayout,
} from "../../../../lib/biloo-pay-payout-server";
export async function GET(request: Request) {
  try {
    const { admin, user } = await payAccess(request, "admin", false);
    return payReply(
      await payRpc(admin, "biloo_pay_snapshot_server", {
        p_actor: user.id,
        p_role: "admin",
      }),
    );
  } catch (error) {
    return payError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { admin, user } = await payAccess(request, "admin");
    const body = await payBody(request);
    if (body.action === "reconcile_payment") {
      if (
        !paymentConfiguration().enabled ||
        typeof body.txRef !== "string" ||
        body.txRef.length > 120
      )
        return payReply({ status: "invalid_request" }, 400);
      const a = await payRpc(admin, "biloo_pay_attempt_server", {
        p_tx_ref: body.txRef,
      });
      if (!a) return payReply({ status: "not_found" }, 404);
      await payRpc(admin, "biloo_pay_admin_audit_server", {
        p_actor: user.id,
        p_subject: a.id,
        p_action: "payment_verification_requested",
      });
      const verified = await verifyChapaPayment({
        txRef: String(a.tx_ref),
        amount: Number(a.amount_minor) / 100,
        mode: a.mode as "live" | "test",
      });
      if (!verified.evidence)
        return payReply({ status: "verification_pending" }, 202);
      return payReply(
        await payRpc(admin, "biloo_pay_settle_chapa_server", {
          p_id: a.id,
          p_evidence: verified.evidence,
        }),
      );
    }
    if (body.action === "reconcile_payout") {
      if (!payoutConfiguration().enabled || !payUuid(body.id))
        return payReply({ status: "invalid_request" }, 400);
      const p = await payRpc<PayPayout>(admin, "biloo_pay_payout_server", {
        p_id: body.id,
      });
      if (!p) return payReply({ status: "not_found" }, 404);
      await payRpc(admin, "biloo_pay_admin_audit_server", {
        p_actor: user.id,
        p_subject: p.id,
        p_action: "payout_verification_requested",
      });
      return payReply({ status: await reconcilePayPayout(admin, p) });
    }
    if (body.action === "review_case") {
      if (
        !payUuid(body.id) ||
        !["under_review", "closed"].includes(String(body.state)) ||
        typeof body.note !== "string"
      )
        return payReply({ status: "invalid_request" }, 400);
      return payReply(
        await payRpc(admin, "biloo_pay_review_case_server", {
          p_actor: user.id,
          p_id: body.id,
          p_state: body.state,
          p_note: body.note,
        }),
      );
    }
    return payReply({ status: "invalid_action" }, 400);
  } catch (error) {
    return payError(error);
  }
}

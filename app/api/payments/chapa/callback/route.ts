import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
  paymentConfiguration,
  verifyChapaPayment,
} from "../../../../../lib/nexride-payments";
import {
  payError,
  payOrigin,
  payReply,
  payRpc,
  requirePayReady,
} from "../../../../../lib/biloo-pay-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!paymentConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const txRef =
      url.searchParams.get("trx_ref") || url.searchParams.get("tx_ref") || "";
    if (!/^biloo-[a-f0-9-]{36}$/.test(txRef))
      return payReply({ status: "invalid" }, 400);
    const admin = serverAdminSupabase();
    await requirePayReady(admin);
    const attempt = await payRpc(admin, "biloo_pay_attempt_server", {
      p_tx_ref: txRef,
    });
    if (!attempt) return payReply({ status: "not_found" }, 404);
    let status = "verification_pending";
    if (attempt.status === "paid") status = "paid";
    else {
      const result = await verifyChapaPayment({
        txRef,
        amount: Number(attempt.amount_minor) / 100,
        mode: attempt.mode as "test" | "live",
      }).catch(() => null);
      if (result?.evidence) {
        await payRpc(admin, "biloo_pay_settle_chapa_server", {
          p_id: attempt.id,
          p_evidence: result.evidence,
        });
        status = "paid";
      }
    }
    if (url.searchParams.get("return") === "1") {
      const target = new URL("/rider/wallet", payOrigin());
      // This parameter is display context only. The wallet always reloads the database.
      target.searchParams.set("payment", status);
      return Response.redirect(target, 303);
    }
    return payReply({ status }, status === "paid" ? 200 : 202);
  } catch (error) {
    return payError(error);
  }
}

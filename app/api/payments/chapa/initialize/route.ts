import { randomUUID } from "node:crypto";
import {
  initializeChapaPayment,
  paymentConfiguration,
} from "../../../../../lib/nexride-payments";
import { payUuid } from "../../../../../lib/biloo-pay-money";
import {
  payAccess,
  payBody,
  payError,
  payKey,
  payOrigin,
  payReply,
  payRpc,
} from "../../../../../lib/biloo-pay-server";

export async function POST(request: Request) {
  if (!paymentConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const { admin, user } = await payAccess(request, "rider");
    const body = await payBody(request);
    if (!payUuid(body.rideRequestId))
      return payReply({ status: "invalid_ride" }, 400);
    if (!user.email) return payReply({ status: "email_required" }, 409);
    const origin = payOrigin();
    const attempt = await payRpc(admin, "biloo_pay_begin_payment_server", {
      p_ride_id: body.rideRequestId,
      p_actor: user.id,
      p_key: payKey(request),
      p_tx_ref: "biloo-" + randomUUID(),
      p_mode: paymentConfiguration().mode,
    });
    if (attempt.status === "paid")
      return payReply({ status: "already_paid" }, 409);
    if (attempt.checkout_url && attempt.status === "pending")
      return payReply({
        status: "ready",
        checkoutUrl: attempt.checkout_url,
        transactionId: attempt.id,
      });
    if (attempt.existing)
      return payReply(
        { status: "verification_required", transactionId: attempt.id },
        202,
      );
    const callbackUrl =
      origin +
      "/api/payments/chapa/callback?trx_ref=" +
      encodeURIComponent(String(attempt.tx_ref));
    try {
      const initialized = await initializeChapaPayment({
        txRef: String(attempt.tx_ref),
        amount: Number(attempt.amount_minor) / 100,
        email: user.email,
        returnUrl: callbackUrl + "&return=1",
        callbackUrl,
      });
      await payRpc(admin, "biloo_pay_save_checkout_server", {
        p_id: attempt.id,
        p_url: initialized.checkoutUrl,
      });
      return payReply({
        status: "ready",
        checkoutUrl: initialized.checkoutUrl,
        transactionId: attempt.id,
      });
    } catch {
      // The provider may have accepted before the network failed. Keep the attempt reserved.
      return payReply(
        { status: "verification_required", transactionId: attempt.id },
        202,
      );
    }
  } catch (error) {
    return payError(error);
  }
}

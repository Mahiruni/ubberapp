import { payUuid } from "../../../../lib/biloo-pay-money";
import {
  payAccess,
  payBody,
  payError,
  payKey,
  payReply,
  payRpc,
} from "../../../../lib/biloo-pay-server";
export async function POST(request: Request) {
  try {
    const { admin, user } = await payAccess(request, "driver");
    const body = await payBody(request);
    if (!payUuid(body.rideRequestId) || body.cashReceived !== true)
      return payReply({ status: "explicit_confirmation_required" }, 400);
    return payReply(
      await payRpc(admin, "biloo_pay_confirm_cash_server", {
        p_ride_id: body.rideRequestId,
        p_actor: user.id,
        p_key: payKey(request),
      }),
    );
  } catch (error) {
    return payError(error);
  }
}

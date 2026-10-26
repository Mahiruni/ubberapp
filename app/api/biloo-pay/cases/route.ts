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
    const { admin, user } = await payAccess(request);
    const body = await payBody(request);
    if (
      !payUuid(body.rideId) ||
      !["refund", "dispute", "reconciliation"].includes(String(body.kind)) ||
      typeof body.reason !== "string" ||
      body.reason.trim().length < 10 ||
      body.reason.length > 1000
    )
      return payReply({ status: "invalid_case" }, 400);
    const result = await payRpc(admin, "biloo_pay_open_case_server", {
      p_actor: user.id,
      p_ride: body.rideId,
      p_kind: body.kind,
      p_reason: body.reason.trim(),
      p_key: payKey(request),
    });
    return payReply({ status: "submitted", case: result }, 201);
  } catch (error) {
    return payError(error);
  }
}

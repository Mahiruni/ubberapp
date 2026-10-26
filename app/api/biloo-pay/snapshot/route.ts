import {
  payAccess,
  payError,
  payReply,
  payRpc,
} from "../../../../lib/biloo-pay-server";
export async function GET(request: Request) {
  try {
    const { admin, user, role } = await payAccess(request, undefined, false);
    return payReply(
      await payRpc(admin, "biloo_pay_snapshot_server", {
        p_actor: user.id,
        p_role: role,
      }),
    );
  } catch (error) {
    return payError(error);
  }
}

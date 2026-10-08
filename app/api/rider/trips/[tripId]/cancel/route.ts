import { authorizedRequestSupabase } from "../../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../../lib/nexride-server-admin";

type RouteContext = { params: Promise<{ tripId: string }> };
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function POST(request: Request, context: RouteContext) {
  const { tripId } = await context.params;
  if (!isUuid(tripId)) return reply({ status: "invalid" }, 400);
  const session = await authorizedRequestSupabase(request);
  if (!session) return reply({ status: "unauthorized" }, 401);
  try {
    // Only a verified token determines the actor. The browser cannot submit
    // someone else's rider ID or manipulate the cancellation charge.
    const { data, error } = await serverAdminSupabase().rpc(
      "rider_cancel_active_trip_server",
      { p_actor: session.user.id, p_request_id: tripId },
    );
    if (error) {
      console.error("rider_cancel_active_trip_failed", { code: error.code || "unknown" });
      return reply({ status: "unavailable" }, error.message?.includes("REQUEST_NOT_FOUND") ? 404 : 503);
    }
    if (!data || typeof data !== "object") return reply({ status: "unavailable" }, 503);
    const result = data as { status?: string; requestId?: string; currentStatus?: string };
    if (result.status === "conflict") return reply(result, 409);
    if (result.status !== "cancelled" || result.requestId !== tripId) return reply({ status: "unavailable" }, 503);
    return reply(result);
  } catch {
    console.error("rider_cancel_active_trip_unavailable");
    return reply({ status: "unavailable" }, 503);
  }
}

import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { notificationTestDelayMs } from "../../../../../lib/biloo-notification-test";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** User-initiated, fixed-copy test to the caller's own registered Driver app. */
export async function POST(request: Request) {
  try {
    const auth = await authorizedRequestSupabase(request);
    if (!auth) return response({ status: "unauthorized" }, 401);
    let payload: { installationId?: unknown; role?: unknown } | null;
    try { payload = await request.json(); } catch { return response({ status: "invalid_json" }, 400); }
    if (payload?.role !== "driver" || typeof payload.installationId !== "string" || !uuid.test(payload.installationId))
      return response({ status: "invalid_device" }, 400);
    const admin = serverAdminSupabase();
    const { data: device, error: deviceError } = await admin.from("nexride_push_devices")
      .select("id").eq("user_id", auth.user.id).eq("role", "driver")
      .eq("installation_id", payload.installationId).eq("enabled", true).maybeSingle();
    if (deviceError) return response({ status: "device_store_unavailable" }, 503);
    if (!device) return response({ status: "device_not_registered" }, 409);
    const now = Date.now();
    // The unique key is an atomic per-account minute limit, including races
    // from multiple devices. The client cannot select the recipient or copy.
    const { error } = await admin.from("nexride_push_outbox").insert({
      dedupe_key: "device-test:" + auth.user.id + ":" + Math.floor(now / 60_000),
      user_id: auth.user.id, role: "driver", kind: "device_test", device_id: device.id,
      created_at: new Date(now).toISOString(), retry_at: new Date(now + notificationTestDelayMs).toISOString(),
    });
    if (error?.code === "23505") return response({ status: "test_rate_limited" }, 429);
    if (error) return response({ status: "test_unavailable" }, 503);
    return response({ status: "queued" }, 202);
  } catch { return response({ status: "test_unavailable" }, 503); }
}

import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Only report this account's installation; never return a device token. */
export async function GET(request: Request) {
  try {
    const auth = await authorizedRequestSupabase(request);
    if (!auth) return response({ status: "unauthorized" }, 401);
    const search = new URL(request.url).searchParams;
    const role = search.get("role");
    const installationId = search.get("installationId") || "";
    if ((role !== "rider" && role !== "driver") || !uuid.test(installationId))
      return response({ status: "invalid_device" }, 400);
    const admin = serverAdminSupabase();
    const { data: device, error } = await admin.from("nexride_push_devices")
      .select("id,enabled").eq("user_id", auth.user.id)
      .eq("role", role).eq("installation_id", installationId).maybeSingle();
    if (error) return response({ status: "device_store_unavailable" }, 503);
    let testStatus = null;
    if (device) {
      const { data: test } = await admin.from("nexride_push_outbox")
        .select("status,created_at").eq("user_id", auth.user.id).eq("device_id", device.id)
        .eq("kind", "device_test").gte("created_at", new Date(Date.now() - 600_000).toISOString())
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      testStatus = test?.status === "sent" ? "accepted_by_fcm"
        : test?.status === "skipped" || (test && Date.parse(test.created_at) + 60_000 <= Date.now()) ? "not_sent" : test ? "queued" : null;
    }
    return response({ status: "checked", registered: !!device?.enabled, testStatus });
  } catch { return response({ status: "device_store_unavailable" }, 503); }
}

/** Tokens never flow through direct browser-table access, even with RLS. */
export async function POST(request: Request) {
  const auth = await authorizedRequestSupabase(request);
  if (!auth) return response({ status: "unauthorized" }, 401);
  let payload: { installationId?: string; token?: string; role?: string; alertProtocol?: number };
  try { payload = await request.json(); } catch { return response({ status: "invalid_json" }, 400); }
  const { installationId, token, role } = payload;
  if (!installationId || !uuid.test(installationId) || !token ||
    token.length < 30 || token.length > 4096 || /\s/.test(token) ||
    (role !== "rider" && role !== "driver")) return response({ status: "invalid_device" }, 400);
  try {
    const admin = serverAdminSupabase();
    if (role === "driver") {
      const { data, error } = await admin.from("drivers").select("id")
        .eq("id", auth.user.id).maybeSingle();
      if (error || !data) return response({ status: "driver_account_required" }, 403);
    }
    const { count, error: countError } = await admin.from("nexride_push_devices")
      .select("id", { count: "exact", head: true }).eq("user_id", auth.user.id);
    if (countError) return response({ status: "device_store_unavailable" }, 503);
    const { data: exists } = await admin.from("nexride_push_devices").select("id")
      .eq("user_id", auth.user.id).eq("role", role).eq("installation_id", installationId).maybeSingle();
    if (!exists && (count ?? 0) >= 12) return response({ status: "device_limit_reached" }, 429);
    // A token identifies this installation; an earlier signed-in account must
    // not keep receiving private offers after the device changes accounts.
    const { error: bindingError } = await admin.from("nexride_push_devices")
      .delete().eq("fcm_token", token).neq("user_id", auth.user.id);
    if (bindingError) return response({ status: "device_binding_failed" }, 503);
    const { error } = await admin.from("nexride_push_devices").upsert({
      user_id: auth.user.id, role, installation_id: installationId,
      fcm_token: token, enabled: true, updated_at: new Date().toISOString(),
      alert_protocol: role === "driver" && payload.alertProtocol === 1 ? 1 : 0,
    }, { onConflict: "user_id,role,installation_id" });
    return error ? response({ status: "registration_failed" }, 503) : response({ status: "registered" });
  } catch { return response({ status: "registration_unavailable" }, 503); }
}
export async function DELETE(request: Request) {
  const auth = await authorizedRequestSupabase(request);
  if (!auth) return response({ status: "unauthorized" }, 401);
  let payload: { installationId?: string; role?: string };
  try { payload = await request.json(); } catch { return response({ status: "invalid_json" }, 400); }
  if (!payload.installationId || !uuid.test(payload.installationId) ||
    (payload.role !== "rider" && payload.role !== "driver")) return response({ status: "invalid_device" }, 400);
  try {
    const { error } = await serverAdminSupabase().from("nexride_push_devices")
      .delete().eq("user_id", auth.user.id).eq("role", payload.role).eq("installation_id", payload.installationId);
    return error ? response({ status: "unregister_failed" }, 503) : response({ status: "unregistered" });
  } catch { return response({ status: "unregister_unavailable" }, 503); }
}

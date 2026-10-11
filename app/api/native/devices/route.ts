import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const response = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Tokens never flow through direct browser-table access, even with RLS. */
export async function POST(request: Request) {
  const auth = await authorizedRequestSupabase(request);
  if (!auth) return response({ status: "unauthorized" }, 401);
  let payload: { installationId?: string; token?: string; role?: string };
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
    const { error } = await admin.from("nexride_push_devices").upsert({
      user_id: auth.user.id, role, installation_id: installationId,
      fcm_token: token, enabled: true, updated_at: new Date().toISOString(),
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

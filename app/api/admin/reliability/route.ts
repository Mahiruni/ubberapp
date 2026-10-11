import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

export async function GET(request: Request) {
  const auth = await authorizedRequestSupabase(request);
  if (!auth) return Response.json({ status: "unauthorized" }, { status: 401 });
  try {
    const admin = serverAdminSupabase();
    const { data: profile, error: profileError } = await admin.from("profiles")
      .select("role,account_status").eq("id", auth.user.id).maybeSingle();
    if (profileError || profile?.role !== "admin" || profile.account_status !== "active")
      return Response.json({ status: "forbidden" }, { status: 403 });
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const [online, eligible, waiting, devices, pending, accepted, skipped] = await Promise.all([
      admin.from("drivers").select("id", { count: "exact", head: true }).eq("is_online", true),
      admin.from("drivers").select("id", { count: "exact", head: true }).eq("is_online", true)
        .eq("review_status", "approved").gte("gps_recorded_at",oneMinuteAgo)
        .gte("last_presence_at",oneMinuteAgo).lte("gps_accuracy_meters",150),
      admin.from("ride_requests").select("id", { count: "exact", head: true })
        .eq("status","pending").eq("dispatch_state","searching"),
      admin.from("nexride_push_devices").select("id", { count: "exact", head: true }).eq("enabled",true),
      admin.from("nexride_push_outbox").select("id", { count: "exact", head: true }).in("status",["pending","processing"]),
      admin.from("nexride_push_outbox").select("id", { count: "exact", head: true }).eq("status","sent"),
      admin.from("nexride_push_outbox").select("id", { count: "exact", head: true }).eq("status","skipped"),
    ]);
    if ([online,eligible,waiting,devices,pending,accepted,skipped].some(x=>x.error))
      return Response.json({ status: "database_unavailable" }, { status: 503 });
    return Response.json({ status: "ready", metrics: {
      onlineDrivers:online.count??0,dispatchEligibleDrivers:eligible.count??0,
      waitingRiders:waiting.count??0,registeredDevices:devices.count??0,
      pendingPush:pending.count??0,acceptedByFcm:accepted.count??0,
      skippedPush:skipped.count??0,
    }, note:"FCM acceptance is not a device display or read receipt." },
    { headers: { "Cache-Control":"no-store" } });
  } catch { return Response.json({ status:"unavailable" }, { status:503 }); }
}

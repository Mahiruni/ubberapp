import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { summarizeServiceQuality, type QualityTrip } from "../../../../lib/nexride-service-quality";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const auth = await authorizedRequestSupabase(request);
    if (!auth) return Response.json({ status: "unauthorized" }, { status: 401, headers });
    const db = serverAdminSupabase();
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("role,account_status").eq("id", auth.user.id).maybeSingle();
    if (profileError) throw new Error("profile_unavailable");
    if (profile?.role !== "admin" || profile.account_status !== "active")
      return Response.json({ status: "forbidden" }, { status: 403, headers });
    const days = new URL(request.url).searchParams.get("days") || "7";
    if (!["7", "30"].includes(days)) return Response.json({ status: "invalid_period" }, { status: 400, headers });
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 86400000);
    // Bounded aggregate of the newest requests. The response explicitly exposes sampling.
    // No GPS coordinates, contact details, trip IDs or Rider IDs are returned.
    const { data, error, count } = await db.from("ride_requests")
      .select("status,created_at,accepted_at,rider_id,cancelled_by", { count: "exact" })
      .gte("created_at", from.toISOString()).lte("created_at", to.toISOString())
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(0, 999);
    if (error || data === null || count === null) throw new Error("data_unavailable");
    return Response.json({ status: "ready", from: from.toISOString(), to: to.toISOString(),
      totalRequests: count, sampled: count > data.length,
      metrics: summarizeServiceQuality(data as QualityTrip[]),
    }, { headers });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}

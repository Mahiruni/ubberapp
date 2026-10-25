import type { RequestSupabase } from "./nexride-server-supabase";

/** Resolve the caller's active trip on the server; never accept a client ride/driver ID.
 * Use the authenticated client so the existing ownership/active-trip trigger and
 * RLS policies remain authoritative for the upsert.
 */
export async function publishNativeTripLocation(
  authorized: RequestSupabase,
  location: { latitude: number; longitude: number; accuracy: number | null },
  heading: unknown,
): Promise<boolean> {
  const { data: trip, error } = await authorized.client.from("ride_requests")
    .select("id").eq("assigned_driver_id", authorized.user.id)
    .in("status", ["accepted", "arrived_pickup", "in_trip"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return false;
  if (!trip) return true;
  const headingDegrees = typeof heading === "number" && Number.isFinite(heading) && heading >= 0 && heading <= 360 ? heading : null;
  const { error: locationError } = await authorized.client.from("ride_driver_locations").upsert({
    ride_request_id: trip.id,
    driver_id: authorized.user.id,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy_meters: location.accuracy,
    heading_degrees: headingDegrees,
  }, { onConflict: "ride_request_id" });
  return !locationError;
}

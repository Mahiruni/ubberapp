import { authorizedRequestSupabase } from "../../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../../lib/nexride-server-admin";
import { normalizeVehicleColor } from "../../../../../../lib/nexride-vehicle";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

type RouteContext = { params: Promise<{ tripId: string }> };

const validId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

const text = (value: unknown, max = 180) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const number = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export async function GET(request: Request, context: RouteContext) {
  const { tripId } = await context.params;
  if (!validId(tripId)) return reply({ status: "invalid" }, 400);

  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  try {
    const admin = serverAdminSupabase();

    const { data: ride, error: rideError } = await admin
      .from("ride_requests")
      .select("id,rider_id,assigned_driver_id,status")
      .eq("id", tripId)
      .eq("rider_id", authorized.user.id)
      .maybeSingle();

    if (rideError) return reply({ status: "trip_unavailable" }, 503);
    if (!ride) return reply({ status: "not_found" }, 404);
    if (!ride.assigned_driver_id)
      return reply({ status: "unassigned", driver: null });

    const driverId = String(ride.assigned_driver_id);
    const active = ["accepted", "arrived_pickup", "in_trip"].includes(
      String(ride.status),
    );

    const [
      profileResult,
      userResult,
      completedResult,
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("full_name,phone")
        .eq("id", driverId)
        .maybeSingle(),
      admin.auth.admin.getUserById(driverId),
      admin
        .from("ride_requests")
        .select("id", { count: "exact", head: true })
        .eq("assigned_driver_id", driverId)
        .eq("status", "completed"),
    ]);

    let driverResult = await admin
      .from("drivers")
      .select(
        "vehicle,vehicle_color,vehicle_plate,rating,review_status,reviewed_at",
      )
      .eq("id", driverId)
      .maybeSingle();

    if (
      driverResult.error &&
      /vehicle_color|schema cache|column/i.test(driverResult.error.message || "")
    ) {
      driverResult = await admin
        .from("drivers")
        .select("vehicle,vehicle_plate,rating,review_status,reviewed_at")
        .eq("id", driverId)
        .maybeSingle();
    }

    if (driverResult.error)
      return reply({ status: "driver_unavailable" }, 503);

    const metadata = userResult.data.user?.user_metadata || {};
    const driver = driverResult.data;
    const profile = profileResult.error ? null : profileResult.data;

    const model =
      text(driver?.vehicle) ||
      text(metadata.vehicle) ||
      text(metadata.vehicle_model);

    const color =
      normalizeVehicleColor(
        (driver as Record<string, unknown> | null)?.vehicle_color,
      ) ||
      normalizeVehicleColor(metadata.vehicle_color);

    const plate =
      text(driver?.vehicle_plate, 60) || text(metadata.vehicle_plate, 60);

    const reviewedAt = text(driver?.reviewed_at, 60);
    const verified =
      driver?.review_status === "approved" && Boolean(reviewedAt);

    return reply({
      status: "ready",
      driver: {
        id: driverId,
        name: text(profile?.full_name) || "Assigned driver",
        photo:
          text(metadata.avatar_url, 500) || text(metadata.avatarUrl, 500) || null,
        phone: active ? text(profile?.phone, 40) || null : null,
        rating: number(driver?.rating),
        tripCount: completedResult.error ? null : completedResult.count ?? 0,
        vehicle: {
          model: model || null,
          color: color || null,
          plate: plate || null,
        },
        verification: verified
          ? {
              status: "verified",
              source: "driver_review",
              verifiedAt: Date.parse(reviewedAt),
            }
          : null,
      },
    });
  } catch {
    return reply({ status: "service_unavailable" }, 503);
  }
}

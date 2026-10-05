import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { mapboxToken, routeBetween } from "../../../../lib/location";
import { insideBounds, serviceBounds, validPoint } from "../../../../lib/nexride-search";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  let body: {
    rideRequestId?: unknown;
    position?: unknown;
    target?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return reply({ status: "invalid" }, 400);
  }

  const rideRequestId =
    typeof body.rideRequestId === "string" ? body.rideRequestId : "";
  const target = body.target === "pickup" || body.target === "destination"
    ? body.target
    : null;
  const position = body.position;

  if (!rideRequestId || !target || !validPoint(position))
    return reply({ status: "invalid" }, 400);

  const coverage = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
  if (!insideBounds(position, coverage.bounds))
    return reply({ status: "coverage" }, 422);

  const { data: profile, error: profileError } = await authorized.client
    .from("profiles")
    .select("role,account_status")
    .eq("id", authorized.user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.role !== "driver" ||
    profile.account_status !== "active"
  ) return reply({ status: "forbidden" }, 403);

  const { data: ride, error: rideError } = await authorized.client
    .from("ride_requests")
    .select(
      "id,status,assigned_driver_id,pickup_lat,pickup_lng,destination_lat,destination_lng",
    )
    .eq("id", rideRequestId)
    .eq("assigned_driver_id", authorized.user.id)
    .maybeSingle();

  if (rideError || !ride) return reply({ status: "not_found" }, 404);

  const allowedTarget =
    ride.status === "accepted" || ride.status === "arrived_pickup"
      ? "pickup"
      : ride.status === "in_trip"
        ? "destination"
        : null;

  if (!allowedTarget || target !== allowedTarget)
    return reply({ status: "stale_stage" }, 409);

  const endpoint =
    target === "pickup"
      ? { lat: Number(ride.pickup_lat), lng: Number(ride.pickup_lng) }
      : { lat: Number(ride.destination_lat), lng: Number(ride.destination_lng) };

  if (!validPoint(endpoint) || !insideBounds(endpoint, coverage.bounds))
    return reply({ status: "route_unavailable" }, 422);

  if (!mapboxToken()) return reply({ status: "provider_unavailable" }, 503);

  try {
    const route = await routeBetween(
      [position, endpoint],
      {
        profile: "driving-traffic",
        requireProvider: true,
        steps: true,
      },
    );

    return reply({
      status: "ready",
      route,
      target,
      generatedAt: Date.now(),
    });
  } catch {
    return reply({ status: "route_unavailable" }, 502);
  }
}

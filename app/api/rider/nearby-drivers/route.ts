import { createHash } from "node:crypto";
import { haversineMeters } from "../../../../lib/location";
import { NEARBY_DRIVER_RADIUS_METERS, withinNearbyDriverRadius } from "../../../../lib/nexride-nearby-vehicles";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import {
  insideBounds,
  serviceBounds,
  validPoint,
} from "../../../../lib/nexride-search";

const MAX_DRIVER_RESULTS = 10;
// Do not arbitrarily discard nearby cars after the latest 80 city-wide pings.
const MAX_DRIVER_QUERY = 500;
const LOCATION_FRESHNESS_MS = 60_000;

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-NexRide-Supply": "live",
    },
  });

type DriverLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

function normalizeDriverLocation(
  value: unknown,
  fallbackUpdatedAt: unknown,
): DriverLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const point = {
    lat: Number(record.latitude),
    lng: Number(record.longitude),
  };
  if (!validPoint(point)) return null;

  const rawUpdatedAt =
    typeof record.updated_at === "string"
      ? record.updated_at
      : typeof fallbackUpdatedAt === "string"
        ? fallbackUpdatedAt
        : "";
  const updatedTime = Date.parse(rawUpdatedAt);
  if (!Number.isFinite(updatedTime)) return null;
  if (Date.now() - updatedTime > LOCATION_FRESHNESS_MS) return null;

  return {
    ...point,
    updatedAt: new Date(updatedTime).toISOString(),
  };
}

export async function GET(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized", vehicles: [] }, 401);

  const params = new URL(request.url).searchParams;
  const riderPoint = {
    lat: Number(params.get("lat")),
    lng: Number(params.get("lng")),
  };
  if (!validPoint(riderPoint))
    return reply({ status: "invalid_location", vehicles: [] }, 400);

  const area = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
  if (!insideBounds(riderPoint, area.bounds))
    return reply({ status: "ready", vehicles: [], coverage: "outside" });

  try {
    const admin = serverAdminSupabase();

    const { data: riderProfile, error: riderError } = await admin
      .from("profiles")
      .select("role,account_status")
      .eq("id", authorized.user.id)
      .maybeSingle();

    if (
      riderError ||
      riderProfile?.role !== "rider" ||
      riderProfile.account_status !== "active"
    )
      return reply({ status: "rider_required", vehicles: [] }, 403);

    const { data: drivers, error: driversError } = await admin
      .from("drivers")
      .select("id,location,updated_at")
      .eq("review_status", "approved")
      .eq("is_online", true)
      .order("updated_at", { ascending: false })
      .limit(MAX_DRIVER_QUERY);

    if (driversError) return reply({ status: "unavailable", vehicles: [] }, 503);
    if (!drivers?.length) return reply({ status: "ready", vehicles: [] });

    const driverIds = drivers
      .map((driver) => driver.id)
      .filter((id): id is string => typeof id === "string" && !!id);

    const [{ data: profiles, error: profileError }, { data: trips, error: tripError }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("id")
          .in("id", driverIds)
          .eq("role", "driver")
          .eq("account_status", "active"),
        admin
          .from("ride_requests")
          .select("assigned_driver_id")
          .in("assigned_driver_id", driverIds)
          .in("status", ["accepted", "arrived_pickup", "in_trip"]),
      ]);

    if (profileError || tripError)
      return reply({ status: "unavailable", vehicles: [] }, 503);

    const eligible = new Set(
      (profiles || [])
        .map((profile) => profile.id)
        .filter((id): id is string => typeof id === "string" && !!id),
    );
    const busy = new Set(
      (trips || [])
        .map((trip) => trip.assigned_driver_id)
        .filter((id): id is string => typeof id === "string" && !!id),
    );

    const vehicles = drivers
      .flatMap((driver) => {
        if (
          typeof driver.id !== "string" ||
          !eligible.has(driver.id) ||
          busy.has(driver.id)
        )
          return [];

        const location = normalizeDriverLocation(
          driver.location,
          driver.updated_at,
        );
        if (!location || !insideBounds(location, area.bounds)) return [];

        const distanceMeters = haversineMeters(riderPoint, location);
        if (
          !withinNearbyDriverRadius(distanceMeters)
        )
          return [];

        return [
          {
            key: createHash("sha256")
              .update(authorized.user.id + ":" + driver.id)
              .digest("hex")
              .slice(0, 20),
            lat: location.lat,
            lng: location.lng,
            updatedAt: location.updatedAt,
            distanceMeters: Math.round(distanceMeters),
          },
        ];
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, MAX_DRIVER_RESULTS);

    return reply({
      status: "ready",
      vehicles,
      updatedAt: new Date().toISOString(),
      freshnessSeconds: LOCATION_FRESHNESS_MS / 1000,
      radiusMeters: NEARBY_DRIVER_RADIUS_METERS,
    });
  } catch {
    return reply({ status: "unavailable", vehicles: [] }, 503);
  }
}

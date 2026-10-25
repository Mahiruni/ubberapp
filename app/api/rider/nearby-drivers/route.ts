import { createHash } from "node:crypto";
import { haversineMeters } from "../../../../lib/location";
import { NEARBY_DRIVER_RADIUS_METERS, withinNearbyDriverRadius } from "../../../../lib/nexride-nearby-vehicles";
import { DRIVER_GPS_MAX_AGE_MS, DRIVER_GPS_MAX_ACCURACY_METERS } from "../../../../lib/nexride-driver-gps";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { resolveDriverMapAvatar } from "../../../../lib/biloo-driver-map-avatar";
import { driverAvatarMetadata } from "../../../../lib/biloo-driver-map-avatar-server";
import {
  insideBounds,
  serviceBounds,
  validPoint,
} from "../../../../lib/nexride-search";

const MAX_DRIVER_RESULTS = 10;
// Do not arbitrarily discard nearby cars after the latest 80 city-wide pings.
const MAX_DRIVER_QUERY = 500;
const LOCATION_FRESHNESS_MS = DRIVER_GPS_MAX_AGE_MS;

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

  // Never trust browser JSON or drivers.updated_at for location freshness.
  const rawUpdatedAt = typeof fallbackUpdatedAt === "string" ? fallbackUpdatedAt : "";
  const updatedTime = Date.parse(rawUpdatedAt);
  if (!Number.isFinite(updatedTime)) return null;
  if (updatedTime > Date.now() + 10_000 || Date.now() - updatedTime > LOCATION_FRESHNESS_MS) return null;

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

    const newestGps = new Date(Date.now() - LOCATION_FRESHNESS_MS).toISOString();
    const { data: drivers, error: driversError } = await admin
      .from("drivers")
      .select("id,location,gps_recorded_at,last_presence_at,gps_accuracy_meters,vehicle,vehicle_color")
      .eq("review_status", "approved")
      .eq("is_online", true)
      .gte("gps_recorded_at", newestGps)
      .gte("last_presence_at", newestGps)
      .lte("gps_accuracy_meters", DRIVER_GPS_MAX_ACCURACY_METERS)
      .order("gps_recorded_at", { ascending: false })
      .limit(MAX_DRIVER_QUERY);

    if (driversError) return reply({ status: "unavailable", vehicles: [] }, 503);
    if (!drivers?.length) return reply({ status: "ready", vehicles: [] });

    const driverIds = drivers
      .map((driver) => driver.id)
      .filter((id): id is string => typeof id === "string" && !!id);

    const [{ data: profiles, error: profileError }, { data: trips, error: tripError }, { data: offers, error: offerError }] =
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
        admin
          .from("ride_request_offers")
          .select("driver_id")
          .in("driver_id", driverIds)
          .eq("status", "pending"),
      ]);

    if (profileError || tripError || offerError)
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

    const pending = new Set((offers || []).map((offer) => offer.driver_id));

    const candidates = drivers
      .flatMap((driver) => {
        if (
          typeof driver.id !== "string" ||
          !eligible.has(driver.id) ||
          busy.has(driver.id) || pending.has(driver.id)
        )
          return [];

        const location = normalizeDriverLocation(
          driver.location,
          driver.gps_recorded_at,
        );
        if (!location || !insideBounds(location, area.bounds) ||
          typeof driver.gps_accuracy_meters !== "number" ||
          driver.gps_accuracy_meters > DRIVER_GPS_MAX_ACCURACY_METERS) return [];

        const distanceMeters = haversineMeters(riderPoint, location);
        if (
          !withinNearbyDriverRadius(distanceMeters)
        )
          return [];

        return [
          {
            driverId: driver.id,
            registeredVehicle: { model: driver.vehicle, color: driver.vehicle_color },
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

    // Resolve cosmetic choices only after fresh GPS, range and eligibility checks.
    // Return no Driver identity or model/plate to nearby supply viewers.
    const vehicles = await Promise.all(candidates.map(async ({ driverId, registeredVehicle, ...vehicle }) => ({
      ...vehicle,
      avatar: resolveDriverMapAvatar(registeredVehicle, await driverAvatarMetadata(admin, driverId)),
    })));

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

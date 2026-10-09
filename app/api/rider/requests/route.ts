import { liveFareSet } from "../../../../lib/nexride-live-pricing";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { resolveRiderEligibility, riderEligibilityHttpStatus } from "../../../../lib/nexride-rider-eligibility";
import { fareTotal, rideCategories } from "../../../../lib/nexride-booking";
import {
  insideAddisServiceRadius,
  insideBounds,
  serviceBounds,
  validPoint,
} from "../../../../lib/nexride-search";
import { haversineMeters } from "../../../../lib/location";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const label = (point: unknown, fallback: string) => {
  const value = point as { name?: unknown; address?: unknown } | null;
  const candidate =
    typeof value?.name === "string" && value.name.trim()
      ? value.name.trim()
      : typeof value?.address === "string" && value.address.trim()
        ? value.address.trim()
        : fallback;
  return candidate.slice(0, 160);
};

export async function POST(request: Request) {
  try {
    const authorized = await authorizedRequestSupabase(request);
    if (!authorized) return reply({ status: "unavailable" }, 401);

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
    if (idempotencyKey.length < 16 || idempotencyKey.length > 120)
      return reply({ status: "failed" }, 400);

    const body = await request.json();
    const {
      pickup,
      destination,
      quoteId,
      category,
      revision,
      paymentMethod,
    } = body || {};

    const area = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
    if (!validPoint(pickup) || !validPoint(destination))
      return reply({ status: "failed" }, 400);
    if (
      !insideBounds(pickup, area.bounds) ||
      !insideBounds(destination, area.bounds) ||
      !insideAddisServiceRadius(pickup) ||
      !insideAddisServiceRadius(destination) ||
      haversineMeters(pickup, destination) < 30
    )
      return reply({ status: "unavailable" }, 422);
    if (!rideCategories.includes(category) || paymentMethod !== "cash")
      return reply({ status: "failed" }, 400);

    const fares = liveFareSet({ pickup, destination });
    const current = fares.offers.find((offer) => offer.category === category);

    if (
      revision !== fares.revision ||
      !current ||
      current.id !== quoteId ||
      current.availability !== "available" ||
      fareTotal(current) === null ||
      Date.parse(fares.expiresAt) <= Date.now()
    ) {
      return reply({ status: "price_changed", fares }, 409);
    }

    // Create the request directly on the trusted server after verifying the
    // Rider JWT above. This keeps booking aligned with the app's current
    // 100 km Addis service area instead of the older database RPC boundary.
    const admin = serverAdminSupabase();

    const eligibility = await resolveRiderEligibility(admin, authorized.user.id);
    if (eligibility !== "eligible") {
      console.warn("nexride_booking_rejected", { reason: eligibility });
      return reply({ status: eligibility }, riderEligibilityHttpStatus(eligibility));
    }

    const { data: existing, error: existingError } = await admin
      .from("ride_requests")
      .select("id,status,dispatch_state")
      .eq("rider_id", authorized.user.id)
      .eq("client_request_key", idempotencyKey)
      .maybeSingle();

    if (existingError) {
      console.error("nexride_booking_lookup_failed", {
        code: existingError.code || "unknown",
      });
      return reply({ status: "failed" }, 500);
    }

    if (existing?.id) {
      return reply({ status: "accepted", requestId: existing.id }, 200);
    }

    const { data: active, error: activeError } = await admin
      .from("ride_requests")
      .select("id,status,dispatch_state")
      .eq("rider_id", authorized.user.id)
      .in("status", ["pending", "accepted", "arrived_pickup", "in_trip"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeError) {
      console.error("nexride_booking_active_lookup_failed", {
        code: activeError.code || "unknown",
      });
      return reply({ status: "failed" }, 500);
    }

    if (active?.id) {
      if (active.status === "pending" && active.dispatch_state === "no_drivers") {
        const { error: cancelOldError } = await admin
          .from("ride_requests")
          .update({
            status: "cancelled",
            cancellation_reason: "superseded_by_new_request",
          })
          .eq("id", active.id)
          .eq("rider_id", authorized.user.id);

        if (cancelOldError) {
          console.error("nexride_booking_supersede_failed", {
            code: cancelOldError.code || "unknown",
          });
          return reply({ status: "failed" }, 500);
        }
      } else {
        // A Rider must never get a generic failure just because an earlier
        // request is still active. Resume that authoritative request instead.
        return reply({ status: "accepted", requestId: active.id }, 200);
      }
    }

    const directKm = haversineMeters(pickup, destination) / 1000;
    const roadKm = Math.max(0.5, directKm * 1.28);
    const durationMinutes = Math.max(4, Math.ceil((roadKm / 22) * 60));
    const quotedFare = fareTotal(current);
    if (quotedFare === null) return reply({ status: "failed" }, 400);

    const { data: created, error: createError } = await admin
      .from("ride_requests")
      .insert({
        rider_id: authorized.user.id,
        pickup_location: label(pickup, "Pickup"),
        destination_location: label(destination, "Destination"),
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        destination_lat: destination.lat,
        destination_lng: destination.lng,
        ride_category: category,
        estimated_trip_fare_etb: quotedFare,
        estimated_trip_distance_km: Number(roadKm.toFixed(2)),
        estimated_trip_duration_minutes: durationMinutes,
        payment_method: paymentMethod,
        payment_status: "pending",
        status: "pending",
        dispatch_state: "searching",
        dispatch_started_at: new Date().toISOString(),
        client_request_key: idempotencyKey,
        pricing_revision: revision,
      })
      .select("id")
      .single();

    if (createError || !created?.id) {
      // A concurrent retry can win either unique constraint. Resolve it to the
      // authoritative active/idempotent request instead of failing the Rider.
      if (createError?.code === "23505") {
        const { data: raced } = await admin
          .from("ride_requests")
          .select("id")
          .eq("rider_id", authorized.user.id)
          .in("status", ["pending", "accepted", "arrived_pickup", "in_trip"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (raced?.id)
          return reply({ status: "accepted", requestId: raced.id }, 200);
      }

      console.error("nexride_booking_create_failed", {
        code: createError?.code || "unknown",
      });
      return reply({ status: "failed" }, 500);
    }

    // Dispatch to eligible online drivers. Distance/ETA may be enriched later;
    // an offer itself is enough for the Driver request UI/realtime flow.
    const { data: driverRows, error: driversError } = await admin
      .from("drivers")
      .select("id,updated_at")
      .eq("review_status", "approved")
      .eq("is_online", true)
      .order("updated_at", { ascending: false })
      .limit(24);

    let eligibleDriverIds: string[] = [];
    if (!driversError && driverRows?.length) {
      const candidateIds = driverRows.map((driver) => String(driver.id));

      const [{ data: driverProfiles }, { data: busyRows }] = await Promise.all([
        admin
          .from("profiles")
          .select("id")
          .in("id", candidateIds)
          .eq("role", "driver")
          .eq("account_status", "active"),
        admin
          .from("ride_requests")
          .select("assigned_driver_id")
          .in("assigned_driver_id", candidateIds)
          .in("status", ["accepted", "arrived_pickup", "in_trip"]),
      ]);

      const activeProfileIds = new Set(
        (driverProfiles || []).map((row) => String(row.id)),
      );
      const busyDriverIds = new Set(
        (busyRows || [])
          .map((row) => row.assigned_driver_id)
          .filter(Boolean)
          .map(String),
      );

      eligibleDriverIds = candidateIds
        .filter(
          (id) => activeProfileIds.has(id) && !busyDriverIds.has(id),
        )
        .slice(0, 8);
    }

    if (eligibleDriverIds.length) {
      const expiresAt = new Date(Date.now() + 30_000).toISOString();
      const { error: offerError } = await admin.from("ride_request_offers").insert(
        eligibleDriverIds.map((driverId) => ({
          request_id: created.id,
          driver_id: driverId,
          pickup_distance_km: null,
          pickup_eta_minutes: null,
          expires_at: expiresAt,
        })),
      );

      if (offerError) {
        console.error("nexride_booking_dispatch_failed", {
          code: offerError.code || "unknown",
        });
      }
    } else {
      await admin
        .from("ride_requests")
        .update({ dispatch_state: "no_drivers" })
        .eq("id", created.id);
    }

    return reply({ status: "accepted", requestId: created.id }, 201);
  } catch {
    return reply({ status: "failed" }, 400);
  }
}

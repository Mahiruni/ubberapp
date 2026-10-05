import { liveFareSet } from "../../../../lib/nexride-live-pricing";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { fareTotal, rideCategories } from "../../../../lib/nexride-booking";
import {
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
      haversineMeters(pickup, destination) < 30
    )
      return reply({ status: "failed" }, 422);
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

    const { data, error } = await authorized.client.functions.invoke(
      "nexride-rider-booking",
      {
        body: {
          operation: "create",
          pickupLocation: label(pickup, "Pickup"),
          destinationLocation: label(destination, "Destination"),
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          category,
          paymentMethod,
          clientRequestKey: idempotencyKey,
          pricingRevision: revision,
        },
      },
    );

    if (error) return reply({ status: "failed" }, 500);

    const result = data as { requestId?: unknown; status?: unknown } | null;
    if (
      result?.status !== "accepted" ||
      typeof result.requestId !== "string" ||
      !result.requestId
    ) {
      return reply({ status: "failed" }, 500);
    }

    return reply({ status: "accepted", requestId: result.requestId }, 201);
  } catch {
    return reply({ status: "failed" }, 400);
  }
}

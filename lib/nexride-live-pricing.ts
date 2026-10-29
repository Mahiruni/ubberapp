import { rideOptions } from "./nexride-preview";
import { routeBetween } from "./location";
import { calculateBilooFare, BILOO_ECONOMY_TARIFF } from "./biloo-pricing";
import type { BookingJourney, FareSet, RideFare } from "./nexride-booking";

const PRICING_WINDOW_MS = 5 * 60_000;
export const LIVE_PRICING_REVISION = BILOO_ECONOMY_TARIFF.revision;

export async function liveFareSet(journey: BookingJourney, now = Date.now()): Promise<FareSet> {
  const bucket = Math.floor(now / PRICING_WINDOW_MS);
  const expiresAt = new Date((bucket + 1) * PRICING_WINDOW_MS).toISOString();
  const economy = rideOptions.find((ride) => ride.id === "economy")!;
  // Provider road-route metrics are mandatory for service fares.
  // Never silently price a straight-line or estimated fallback route.
  const route = await routeBetween([journey.pickup, journey.destination], {
    profile: "driving-traffic",
    requireProvider: true,
  });
  if (route.provider !== "mapbox" || !Number.isFinite(route.distanceMeters) || !Number.isFinite(route.durationSeconds))
    throw new Error("verified_route_unavailable");
  const priced = {
    amount: calculateBilooFare(route.distanceMeters / 1000, route.durationSeconds / 60),
  };

  const offers: RideFare[] = [
    {
      id: `live-economy-${bucket}-${priced.amount}`,
      category: "economy",
      seats: economy.seats,
      availability: "available",
      pickupMinutes: null,
      amount: priced.amount,
      currency: "ETB",
      priceType: "estimate",
      charges: [],
    },
    {
      id: `live-comfort-${bucket}-unavailable`,
      category: "comfort",
      seats: 4,
      availability: "unavailable",
      pickupMinutes: null,
      amount: null,
      currency: "ETB",
      priceType: "confirmed",
      charges: [],
    },
    {
      id: `live-xl-${bucket}-unavailable`,
      category: "xl",
      seats: 6,
      availability: "unavailable",
      pickupMinutes: null,
      amount: null,
      currency: "ETB",
      priceType: "confirmed",
      charges: [],
    },
  ];

  return {
    source: "service",
    revision: `${LIVE_PRICING_REVISION}:${bucket}`,
    expiresAt,
    chargesComplete: true,
    offers,
  };
}

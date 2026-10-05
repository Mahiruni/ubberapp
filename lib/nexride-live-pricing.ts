import { previewFare, rideOptions } from "./nexride-preview";
import type { BookingJourney, FareSet, RideFare } from "./nexride-booking";

const PRICING_WINDOW_MS = 5 * 60_000;
export const LIVE_PRICING_REVISION = "pricing-v1";

export function liveFareSet(journey: BookingJourney, now = Date.now()): FareSet {
  const bucket = Math.floor(now / PRICING_WINDOW_MS);
  const expiresAt = new Date((bucket + 1) * PRICING_WINDOW_MS).toISOString();
  const economy = rideOptions.find((ride) => ride.id === "economy")!;
  const priced = previewFare(
    journey.pickup,
    { ...journey.destination, name: "", address: "" },
    economy,
  );

  const offers: RideFare[] = [
    {
      id: `live-economy-${bucket}-${priced.amount}`,
      category: "economy",
      seats: economy.seats,
      availability: "available",
      pickupMinutes: null,
      amount: priced.amount,
      currency: "ETB",
      priceType: "confirmed",
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

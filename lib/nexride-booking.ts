import { previewFare, rideOptions } from "./nexride-preview";
import { validPoint } from "./nexride-search";
export const rideCategories = ["economy", "comfort", "xl"] as const;
export type RideCategory = (typeof rideCategories)[number];
export type RideFare = {
  id: string;
  category: RideCategory;
  seats: number;
  availability: "preview" | "available" | "unavailable";
  pickupMinutes: number | null;
  amount: number | null;
  currency: "ETB";
  priceType: "sample" | "estimate" | "confirmed";
  charges: { name: string; amount: number }[];
};
export type FareSet = {
  source: "preview" | "service";
  revision: string;
  expiresAt: string;
  chargesComplete: boolean;
  offers: RideFare[];
};
export type BookingJourney = {
  pickup: { lat: number; lng: number; name?: string; address?: string };
  destination: { lat: number; lng: number; name?: string; address?: string };
};
export const fareTotal = (fare: RideFare) =>
  fare.amount === null
    ? null
    : fare.amount + fare.charges.reduce((sum, c) => sum + c.amount, 0);
export function validFareSet(value: unknown): value is FareSet {
  const set = value as FareSet | null;
  return (
    !!set &&
    ["preview", "service"].includes(set.source) &&
    typeof set.revision === "string" &&
    !!set.revision &&
    typeof set.expiresAt === "string" &&
    Number.isFinite(Date.parse(set.expiresAt)) &&
    typeof set.chargesComplete === "boolean" &&
    Array.isArray(set.offers) &&
    set.offers.length === 3 &&
    set.offers.every((o) => !!o && typeof o === "object") &&
    rideCategories.every(
      (category) =>
        set.offers.filter((o) => o.category === category).length === 1,
    ) &&
    set.offers.every(
      (o) =>
        typeof o.id === "string" &&
        !!o.id &&
        o.currency === "ETB" &&
        Number.isInteger(o.seats) &&
        o.seats > 0 &&
        o.seats <= 12 &&
        ["preview", "available", "unavailable"].includes(o.availability) &&
        (set.source === "preview"
          ? o.priceType === "sample" && o.availability !== "available"
          : ["estimate", "confirmed"].includes(o.priceType) &&
            o.availability !== "preview") &&
        (o.pickupMinutes === null ||
          (set.source === "service" &&
            Number.isFinite(o.pickupMinutes) &&
            o.pickupMinutes >= 0)) &&
        (o.amount === null
          ? o.availability === "unavailable"
          : Number.isFinite(o.amount) && o.amount > 0) &&
        Array.isArray(o.charges) &&
        o.charges.every(
          (c) =>
            !!c &&
            typeof c.name === "string" &&
            !!c.name &&
            Number.isFinite(c.amount) &&
            c.amount >= 0,
        ) &&
        (fareTotal(o) === null || Number.isFinite(fareTotal(o))),
    )
  );
}
export function previewFares(journey: BookingJourney): FareSet {
  if (!validPoint(journey.pickup) || !validPoint(journey.destination))
    throw new Error("invalid journey");
  const offers: RideFare[] = rideCategories.map((category) => {
    const ride = rideOptions.find((r) => r.id === category)!;
    const { amount } = previewFare(
      journey.pickup,
      { ...journey.destination, name: "", address: "" },
      ride,
    );
    return {
      id: `preview-${category}-${amount}`,
      category,
      seats: ride.seats,
      availability: "preview",
      pickupMinutes: null,
      amount,
      currency: "ETB",
      priceType: "sample",
      charges: [],
    };
  });
  return {
    source: "preview",
    revision: `preview:${offers.map((o) => o.id).join(":")}`,
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    chargesComplete: false,
    offers,
  };
}
export function pricingFingerprint(set: FareSet) {
  return JSON.stringify([
    set.source,
    set.chargesComplete,
    ...rideCategories.map((c) => {
      const o = set.offers.find((o) => o.category === c)!;
      return [
        o.category,
        o.availability,
        o.amount,
        o.currency,
        o.priceType,
        o.charges,
      ];
    }),
  ]);
}
export type BookingResult =
  | { status: "accepted"; requestId: string }
  | { status: "price_changed"; fares: FareSet }
  | { status: "unavailable" | "failed" };
// The server must authenticate, reprice and deduplicate before creating a real trip.
export const bookingAdapter = {
  async fares(journey: BookingJourney, signal: AbortSignal): Promise<FareSet> {
    const { nexrideApiFetch } = await import("./nexride-api-auth");
    let lastFailure: unknown = new Error("fares_unavailable");
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal.aborted) throw signal.reason || new Error("fare_request_aborted");
      try {
        const response = await nexrideApiFetch("/api/rider/fares", {
          method: "POST",
          cache: "no-store",
          signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(journey),
        });

        if (response.ok) {
          const data: unknown = await response.json();
          if (!validFareSet(data)) throw new Error("fares_invalid_response");
          // Prices close to expiration cause a race between quote and booking.
          if (Date.parse(data.expiresAt) - Date.now() <= 1500) {
            lastFailure = new Error("fare_quote_expiring");
          } else {
            return data;
          }
        } else if (![429, 502, 503, 504].includes(response.status)) {
          // Do not repeatedly retry invalid journeys or ineligible accounts.
          throw new Error(`fares_http_${response.status}`);
        } else {
          lastFailure = new Error(`fares_http_${response.status}`);
        }
      } catch (error) {
        if (signal.aborted) throw error;
        lastFailure = error;
        // Authorization/validation failures must not be retried.
        if (
          error instanceof Error &&
          /^fares_http_(400|401|403|404|422)$/.test(error.message)
        )
          throw error;
      }
      if (attempt < 2) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
          }, attempt === 0 ? 300 : 700);
          const abort = () => {
            clearTimeout(timeout);
            reject(signal.reason || new Error("fare_request_aborted"));
          };
          signal.addEventListener("abort", abort, { once: true });
        });
      }
    }
    throw lastFailure;
  },
  async request(
    journey: BookingJourney,
    fare: RideFare,
    revision: string,
    idempotencyKey: string,
  ): Promise<BookingResult> {
    const { nexrideApiHeaders } = await import("./nexride-api-auth");
    const headers = await nexrideApiHeaders(true);
    headers["Idempotency-Key"] = idempotencyKey;
    const response = await fetch("/api/rider/requests", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers,
      body: JSON.stringify({
        ...journey,
        quoteId: fare.id,
        category: fare.category,
        revision,
        paymentMethod: "cash",
      }),
    });
    const result = await response.json();
    if (
      response.status === 409 &&
      result.status === "price_changed" &&
      validFareSet(result.fares)
    )
      return result;
    if (
      response.ok &&
      result.status === "accepted" &&
      typeof result.requestId === "string" &&
      result.requestId
    )
      return result;
    if (result.status === "unavailable" || result.status === "failed")
      return result;
    throw new Error("request_status_unknown");
  },
};

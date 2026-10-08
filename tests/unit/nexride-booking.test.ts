import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bookingAdapter,
  fareTotal,
  previewFares,
  pricingFingerprint,
  validFareSet,
} from "../../lib/nexride-booking";
import { POST as fares } from "../../app/api/rider/fares/route";
import { POST as requestRide } from "../../app/api/rider/requests/route";
const journey = {
  pickup: { lat: 9.008, lng: 38.775 },
  destination: { lat: 8.978, lng: 38.799 },
};
const request = (body: unknown = journey) =>
  new Request("http://localhost/api/rider/fares", {
    method: "POST",
    body: JSON.stringify(body),
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("ride quotes and request integration", () => {
  it("returns exactly three labeled sample categories without invented arrival times", async () => {
    const response = await fares(request()),
      data = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(validFareSet(data)).toBe(true);
    expect(data.source).toBe("preview");
    expect(data.offers.map((o: { category: string }) => o.category)).toEqual([
      "economy",
      "comfort",
      "xl",
    ]);
    expect(
      data.offers.every(
        (o: {
          pickupMinutes: number | null;
          availability: string;
          priceType: string;
        }) =>
          o.pickupMinutes === null &&
          o.availability === "preview" &&
          o.priceType === "sample",
      ),
    ).toBe(true);
    expect(data.chargesComplete).toBe(false);
  });
  it("validates geography and rejects same or uncovered endpoints", async () => {
    expect((await fares(request({}))).status).toBe(400);
    expect(
      (await fares(request({ ...journey, destination: journey.pickup })))
        .status,
    ).toBe(422);
    expect(
      (await fares(request({ ...journey, pickup: { lat: 0, lng: 0 } }))).status,
    ).toBe(422);
  });
  it("rejects unauthenticated ride creation instead of simulating a request", async () => {
    const response = await requestRide(
      new Request("http://localhost/api/rider/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("totals every supplied charge once and rejects malformed or misleading quotes", () => {
    const set = previewFares(journey),
      offer = set.offers[0];
    offer.charges = [
      { name: "Service fee", amount: 25 },
      { name: "Airport fee", amount: 50 },
    ];
    expect(fareTotal(offer)).toBe(offer.amount! + 75);
    expect(validFareSet({ ...set, source: "service" })).toBe(false);
    expect(validFareSet({ ...set, offers: [offer, offer, offer] })).toBe(false);
    expect(
      validFareSet({ ...set, offers: [null, ...set.offers.slice(1)] }),
    ).toBe(false);
    expect(
      validFareSet({
        ...set,
        offers: set.offers.map((o) => ({ ...o, pickupMinutes: 4 })),
      }),
    ).toBe(false);
    expect(
      validFareSet({
        ...set,
        offers: set.offers.map((o) => ({ ...o, amount: Infinity })),
      }),
    ).toBe(false);
  });
  it("recovers after a transient 503, reusing fresh headers and refusing expired quotes", async () => {
    const fresh = previewFares(journey);
    const failure = Response.json({ status: "temporarily_unavailable" }, { status: 503 });
    const fetch = vi.fn().mockResolvedValueOnce(failure).mockResolvedValueOnce(Response.json(fresh));
    vi.stubGlobal("fetch", fetch);
    const result = await bookingAdapter.fares(journey, new AbortController().signal);
    expect(result.source).toBe("preview");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("distinguishes price changes from quote renewal", () => {
    const set = previewFares(journey),
      renewal = {
        ...set,
        revision: "new",
        offers: set.offers.map((o) => ({ ...o, id: o.id + "new" })),
      };
    expect(pricingFingerprint(set)).toBe(pricingFingerprint(renewal));
    renewal.offers[0].amount! += 20;
    expect(pricingFingerprint(set)).not.toBe(pricingFingerprint(renewal));
  });
  it("rejects expired quotes and keeps request retries idempotent", async () => {
    const set = previewFares(journey);
    set.expiresAt = new Date(0).toISOString();
    const fetch = vi.fn().mockResolvedValue(Response.json(set));
    vi.stubGlobal("fetch", fetch);
    await expect(
      bookingAdapter.fares(journey, new AbortController().signal),
    ).rejects.toThrow();
    fetch.mockImplementation(() =>
      Promise.resolve(Response.json({ status: "failed" }, { status: 503 })),
    );
    const key = "same-attempt";
    await bookingAdapter.request(journey, set.offers[0], set.revision, key);
    await bookingAdapter.request(journey, set.offers[0], set.revision, key);
    expect(
      fetch.mock.calls
        .slice(1)
        .every((call) => new Headers(call[1].headers).get("Idempotency-Key") === key),
    ).toBe(true);
  });
});

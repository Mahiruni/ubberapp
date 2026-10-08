import { describe, expect, it } from "vitest";
import { NEARBY_DRIVER_RADIUS_METERS, withinNearbyDriverRadius } from "../../lib/nexride-nearby-vehicles";

describe("NexRide nearby driver supply", () => {
  it("uses an inclusive one-kilometre radius", () => {
    expect(NEARBY_DRIVER_RADIUS_METERS).toBe(1000);
    expect(withinNearbyDriverRadius(0)).toBe(true);
    expect(withinNearbyDriverRadius(999.99)).toBe(true);
    expect(withinNearbyDriverRadius(1000)).toBe(true);
  });
  it("filters out distant or invalid locations", () => {
    for (const distance of [1000.01, 8000, -1, NaN, Infinity, -Infinity]) {
      expect(withinNearbyDriverRadius(distance)).toBe(false);
    }
  });
});

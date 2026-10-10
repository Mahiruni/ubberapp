import { describe, expect, it } from "vitest";
import { driverGpsQuality, driverRadarCollection } from "../../lib/nexride-driver-radar";
import type { RiderLocation } from "../../lib/nexride-location";

const point: RiderLocation = {
  lat: 9.008, lng: 38.775, accuracy: 12, timestamp: 100_000, heading: 68,
};

describe("NexRide Driver real GPS radar", () => {
  it("only labels a recent measured GPS position as live", () => {
    expect(driverGpsQuality(point, "ready", 110_000)).toBe("live");
    expect(driverGpsQuality(point, "ready", 115_000)).toBe("stale");
    expect(driverGpsQuality(null, "ready", 110_000)).toBe("acquiring");
    expect(driverGpsQuality(point, "denied", 110_000)).toBe("denied");
    expect(driverGpsQuality(point, "unavailable", 110_000)).toBe("unavailable");
  });
  it("keeps location-only radar empty when offline, invalid or disabled", () => {
    expect(driverRadarCollection(point, false).features).toHaveLength(0);
    expect(driverRadarCollection(null, true).features).toHaveLength(0);
    expect(driverRadarCollection({ ...point, lat: 120 }, true).features).toHaveLength(0);
  });
  it("renders two closed geospatial rings only around the device's fix", () => {
    const features = driverRadarCollection(point, true).features;
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.properties.meters)).toEqual([500, 1000]);
    for (const feature of features) {
      const ring = feature.geometry.coordinates[0];
      expect(ring).toHaveLength(65);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });
});

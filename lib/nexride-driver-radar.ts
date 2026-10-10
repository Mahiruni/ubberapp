import type { LocationStatus, RiderLocation } from "./nexride-location";

export type DriverGpsQuality = "live" | "stale" | "acquiring" | "denied" | "unavailable";

export const DRIVER_GPS_FRESH_MS = 15_000;

export function driverGpsQuality(
  position: RiderLocation | null,
  status: LocationStatus,
  now: number,
): DriverGpsQuality {
  if (status === "denied") return "denied";
  if (status === "unavailable") return "unavailable";
  if (status !== "ready" || !position) return "acquiring";
  if (!Number.isFinite(position.timestamp) ||
      position.timestamp > now + 5_000 ||
      now - position.timestamp >= DRIVER_GPS_FRESH_MS) return "stale";
  return "live";
}

/** Real 500 m / 1 km map-space rings around a recent device GPS fix, not rider detections. */
export function driverRadarCollection(position: RiderLocation | null, active: boolean) {
  const lat = position?.lat, lng = position?.lng;
  if (!active || !position || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      Math.abs(lat!) > 90 || Math.abs(lng!) > 180) {
    return { type: "FeatureCollection" as const, features: [] };
  }
  const latitudeRadians = lat! * Math.PI / 180;
  const radii = [500, 1000];
  const features = radii.map((meters) => {
    const latDelta = meters / 111_320;
    const lngDelta = meters / Math.max(1, 111_320 * Math.cos(latitudeRadians));
    const ring: [number, number][] = [];
    for (let i = 0; i <= 64; i++) {
      const theta = 2 * Math.PI * i / 64;
      ring.push([lng! + Math.cos(theta) * lngDelta, lat! + Math.sin(theta) * latDelta]);
    }
    return {
      type: "Feature" as const,
      properties: { meters },
      geometry: { type: "Polygon" as const, coordinates: [ring] },
    };
  });
  return { type: "FeatureCollection" as const, features };
}

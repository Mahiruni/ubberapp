/** NexRide's dispatch-grade foreground GPS policy. Mirrors the database eligibility gate. */
export const DRIVER_GPS_MAX_AGE_MS = 60_000;
export const DRIVER_GPS_MAX_ACCURACY_METERS = 150;
export const DRIVER_GPS_SYNC_MIN_INTERVAL_MS = 10_000;
export const DRIVER_GPS_HEARTBEAT_MS = 15_000;
export const DRIVER_GPS_FIX_MAX_AGE_MS = 30_000;

export type DriverGpsHealth = "ready" | "waiting" | "inaccurate" | "stale";

export function gpsFixUsable(
  position: { latitude: number; longitude: number; accuracy: number; timestamp: number },
  now = Date.now(),
): boolean {
  return Number.isFinite(position.latitude) && Math.abs(position.latitude) <= 90 &&
    Number.isFinite(position.longitude) && Math.abs(position.longitude) <= 180 &&
    Number.isFinite(position.accuracy) && position.accuracy >= 0 &&
    position.accuracy <= 100_000 && Number.isFinite(position.timestamp) &&
    position.timestamp <= now + 10_000 && now - position.timestamp <= DRIVER_GPS_FIX_MAX_AGE_MS;
}

export function driverGpsHealth(
  location: { accuracy: number | null; timestamp: number | null } | null,
  now = Date.now(),
): DriverGpsHealth {
  if (!location || location.timestamp === null || !Number.isFinite(location.timestamp))
    return "waiting";
  if (location.timestamp > now + 10_000 ||
    now - location.timestamp > DRIVER_GPS_MAX_AGE_MS) return "stale";
  if (location.accuracy === null || !Number.isFinite(location.accuracy) ||
    location.accuracy < 0 || location.accuracy > DRIVER_GPS_MAX_ACCURACY_METERS) return "inaccurate";
  return "ready";
}

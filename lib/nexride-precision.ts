/** NexRide precision-mobility domain contracts.
 * Display modes are not evidence of live service availability.
 * Keep dispatch, pricing and authorization decisions on the server.
 */
export type RideMode = "sprint" | "gt" | "paddock";
export type Atmosphere = "quiet" | "chat" | "none";
export type Climate = "cool" | "warm" | "windows" | "none";
export type RouteStyle = "fastest" | "smoothest" | "none";
export type Assistance = "luggage" | "quick-pickup" | "accessible" | "none";
export interface CabinPreferences {
  atmosphere: Atmosphere;
  climate: Climate;
  routeStyle: RouteStyle;
  assistance: Assistance;
}
export interface RiderLoyaltyStatus {
  completedQualifyingTrips: number;
  riderRating: number | null;
  ratingSampleSize: number;
  accountInGoodStanding: boolean;
  paddockEligible: boolean; // authoritative server result, not a client calculation
}
export interface PilotTelemetry {
  driverId: string;
  driverName: string;
  vehiclePlate: string;
  verified: boolean;
  completedTrips: number | null;
  driverRating: number | null;
  distanceToPickupMeters: number | null;
  etaSeconds: number | null;
  locationUpdatedAt: string | null;
  tripStatus: "assigned" | "arrived" | "on_trip" | "completed";
}
export interface DriverRecognition {
  driverId: string;
  code: string;
  label: string;
  verifiedAt: string;
}
export interface FavoritePilot {
  driverId: string;
  addedAt: string;
  driverOptedIn: boolean;
}
export type TripPreferenceAcknowledgment =
  | { status: "saved" | "sent"; at: string | null }
  | { status: "acknowledged" | "unable"; at: string; reason?: string };

export const DEFAULT_CABIN_PREFERENCES: Readonly<CabinPreferences> = Object.freeze({
  atmosphere: "none",
  climate: "none",
  routeStyle: "none",
  assistance: "none",
});
export const RIDE_MODE_LABELS: Readonly<Record<RideMode, string>> = {
  sprint: "Sprint",
  gt: "Grand Tour",
  paddock: "NexRide Paddock",
};
export function isFreshTelemetry(telemetry: PilotTelemetry, nowMs: number, maxAgeMs = 30_000): boolean {
  if (!telemetry.locationUpdatedAt || !Number.isFinite(nowMs) || maxAgeMs <= 0) return false;
  const timestamp = Date.parse(telemetry.locationUpdatedAt);
  return Number.isFinite(timestamp) && timestamp <= nowMs && nowMs - timestamp <= maxAgeMs;
}
export function formatArrivalEstimate(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "ETA unavailable";
  const total = Math.ceil(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

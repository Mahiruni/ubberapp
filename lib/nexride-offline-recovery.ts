/** Account-scoped, short-lived offline trip context. Never a source of ride truth.
 * No OTPs, session keys, GPS history, phone numbers or mutable actions stored.
 */
export const OFFLINE_PREFIX = "nexride.offline.v2.";
export const DRIVER_OFFLINE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
export const RIDER_OFFLINE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Position = { lat: number; lng: number };
export type RememberedDriverTrip = {
  offerId: string; requestId: string;
  status: "accepted" | "arrived_pickup" | "in_trip";
  rideCategory: string;
  pickup: string; destination: string;
  pickupCoordinate: Position | null; destinationCoordinate: Position | null;
  pickupDistanceKm: number | null; pickupEtaMinutes: number | null;
  tripDistanceKm: number | null; tripDurationMinutes: number | null;
};
export type RememberedRiderTrip = {
  id: string; state: string; pickup_address: string;
  destination_address: string; service_type: string;
  total_minor: number | null; currency: "ETB";
  requested_at: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set(["accepted", "arrived_pickup", "in_trip"]);
const riderStates = new Set(["pending", "accepted", "arrived_pickup", "in_trip", "completed", "cancelled", "withdrawn"]);
const validId = (value: string) => UUID.test(value);
const validPoint = (v: unknown): v is Position => !!v && typeof v === "object" &&
  Number.isFinite((v as Position).lat) && Math.abs((v as Position).lat) <= 90 &&
  Number.isFinite((v as Position).lng) && Math.abs((v as Position).lng) <= 180;
const finite = (v: unknown): number | null => typeof v === "number" &&
  Number.isFinite(v) && v >= 0 && v < 1_000_000 ? v : null;
const label = (v: unknown) => typeof v === "string" ? v.trim().slice(0, 160) : "";
const key = (role: "driver" | "rider", userId: string, tripId?: string) =>
  OFFLINE_PREFIX + role + "." + userId + (tripId ? "." + tripId : "");

export function storeDriverTrip(store: Store, userId: string, value: RememberedDriverTrip, now = Date.now()): boolean {
  if (!validId(userId) || !validId(value.offerId) || !validId(value.requestId) || !states.has(value.status)) return false;
  const stored: RememberedDriverTrip = {
    offerId: value.offerId, requestId: value.requestId, status: value.status,
    rideCategory: label(value.rideCategory), pickup: label(value.pickup),
    destination: label(value.destination),
    pickupCoordinate: validPoint(value.pickupCoordinate) ? value.pickupCoordinate : null,
    destinationCoordinate: validPoint(value.destinationCoordinate) ? value.destinationCoordinate : null,
    pickupDistanceKm: finite(value.pickupDistanceKm), pickupEtaMinutes: finite(value.pickupEtaMinutes),
    tripDistanceKm: finite(value.tripDistanceKm), tripDurationMinutes: finite(value.tripDurationMinutes),
  };
  try { store.setItem(key("driver",userId,value.offerId),JSON.stringify({ savedAt: now, trip: stored })); return true; }
  catch { return false; }
}
export function readDriverTrip(store: Store, userId: string, offerId: string, now = Date.now()): RememberedDriverTrip | null {
  if (!validId(userId) || !validId(offerId)) return null;
  const storageKey = key("driver",userId,offerId);
  try {
    const raw = store.getItem(storageKey);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    const entry = data as { savedAt?: unknown; trip?: Partial<RememberedDriverTrip> };
    const age = now - Number(entry?.savedAt);
    const t = entry?.trip;
    if (!Number.isFinite(age) || age < 0 || age > DRIVER_OFFLINE_MAX_AGE_MS ||
        !t || t.offerId !== offerId || !validId(String(t.requestId)) ||
        !states.has(String(t.status)) || !label(t.pickup) || !label(t.destination) ||
        (t.pickupCoordinate !== null && !validPoint(t.pickupCoordinate)) ||
        (t.destinationCoordinate !== null && !validPoint(t.destinationCoordinate))) {
      store.removeItem(storageKey); return null;
    }
    return {
      offerId, requestId: String(t.requestId), status: t.status as RememberedDriverTrip["status"],
      rideCategory: label(t.rideCategory), pickup: label(t.pickup),
      destination: label(t.destination),
      pickupCoordinate: t.pickupCoordinate ?? null, destinationCoordinate: t.destinationCoordinate ?? null,
      pickupDistanceKm: finite(t.pickupDistanceKm), pickupEtaMinutes: finite(t.pickupEtaMinutes),
      tripDistanceKm: finite(t.tripDistanceKm), tripDurationMinutes: finite(t.tripDurationMinutes),
    };
  } catch { return null; }
}
export function clearDriverTrip(store: Store, userId: string, offerId: string) {
  if (!validId(userId) || !validId(offerId)) return;
  try { store.removeItem(key("driver",userId,offerId)); } catch {}
}
export function storeRiderTrips(store: Store, userId: string, rows: Record<string,unknown>[], now = Date.now()): boolean {
  if (!validId(userId)) return false;
  const saved: RememberedRiderTrip[] = rows.filter(row =>
    validId(String(row.id)) && riderStates.has(String(row.state)))
    .slice(0,30).map(row => ({
      id: String(row.id), state: String(row.state),
      pickup_address: label(row.pickup_address), destination_address: label(row.destination_address),
      service_type: label(row.service_type), total_minor: finite(row.total_minor),
      currency: "ETB", requested_at: label(row.requested_at),
    }));
  try { store.setItem(key("rider",userId), JSON.stringify({ savedAt: now, rows: saved })); return true; }
  catch { return false; }
}
export function readRiderTrips(store: Store, userId: string, now = Date.now()): RememberedRiderTrip[] {
  if (!validId(userId)) return [];
  try {
    const raw=store.getItem(key("rider",userId)); if (!raw) return [];
    const data=JSON.parse(raw) as { savedAt?: number; rows?: RememberedRiderTrip[] };
    const age=now-Number(data.savedAt);
    if (!Number.isFinite(age) || age<0 || age>RIDER_OFFLINE_MAX_AGE_MS || !Array.isArray(data.rows)) {
      store.removeItem(key("rider",userId));return [];
    }
    return data.rows.filter(r=>r && validId(r.id) && riderStates.has(r.state)).slice(0,30);
  } catch { return []; }
}
export function purgeOfflineTripContext(store: Pick<Storage,"length"|"key"|"removeItem">) {
  // Run only after explicit local logout. Never affect Supabase auth storage.
  try {
    const keys: string[]=[];
    for (let i=0;i<store.length;i++) {
      const candidate=store.key(i);
      if (candidate?.startsWith(OFFLINE_PREFIX) || candidate?.startsWith("nexride.trip.cache.")) keys.push(candidate);
    }
    keys.forEach(candidate=>store.removeItem(candidate));
  } catch {}
}

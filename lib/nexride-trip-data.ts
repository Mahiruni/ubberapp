// Narrow presentation data. Never infer travel, arrival, payment, or verification.
export type Row = Record<string, unknown>;
export type Point = { lat: number; lng: number };
export type TripSnapshot = {
  id: string; revision: number; status: 'approaching' | 'arrived' | 'reassigning' | 'in_trip' | 'completed' | 'cancelled';
  category?: string; driver: null | { id: string; name?: string; photo?: string; contactPhone?: string; rating?: number; tripCount?: number;
    vehicle: { model?: string; color?: string; plate?: string }; verification?: { status: 'verified'; source: string; verifiedAt: number } };
  pickup: Partial<Point> & { name?: string; instructions?: string }; destination: Partial<Point> & { name?: string };
  tracking: null | (Point & { driverId: string; updatedAt: number; accuracyMeters?: number; etaMinutes?: number; etaUpdatedAt?: number; route?: Point[] });
  route?: { id: string; points: Point[] }; metrics?: { arrivalAt?: number; remainingMeters?: number; updatedAt: number };
  delayedArrival?: boolean; fare?: { amount: number; currency: string }; finalAmount?: { amount: number; currency: string };
  completedAt?: number; payment: { status: 'paid' | 'pending' | 'failed' | 'unknown'; method?: string }; rating?: { status: 'submitted'; score: number };
};
export const textValue = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
const numberValue = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : undefined;
export const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : numberValue(v);
const record = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
export function validPoint(p: unknown): p is Point {
  const v = record(p); return typeof v.lat === 'number' && Number.isFinite(v.lat) && Math.abs(v.lat) <= 90 && typeof v.lng === 'number' && Number.isFinite(v.lng) && Math.abs(v.lng) <= 180;
}
// PostgREST geography can be GeoJSON, WKT, or EWKB; SRID must be WGS84.
export function geography(v: unknown): Point | undefined {
  if (validPoint(v)) return { lat: v.lat, lng: v.lng };
  const r = record(v), coordinates = r.coordinates;
  if (r.type === 'Point' && Array.isArray(coordinates)) { const p = { lat: coordinates[1], lng: coordinates[0] }; if (validPoint(p)) return p; }
  if (typeof v !== 'string') return;
  const match = v.match(/^(?:SRID=4326;)?POINT\s*\(([-\d.e+]+)\s+([-\d.e+]+)\)$/i);
  if (match) { const p = { lat: Number(match[2]), lng: Number(match[1]) }; if (validPoint(p)) return p; }
  const hex = v.replace(/^\\x/, '');
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2) return;
  try {
    const bytes = Uint8Array.from(hex.match(/../g)!, a => parseInt(a, 16)), view = new DataView(bytes.buffer), little = view.getUint8(0) === 1;
    const type = view.getUint32(1, little); if ((type & 0xffff) !== 1 || (type & 0xc0000000)) return;
    const srid = !!(type & 0x20000000), offset = srid ? 9 : 5;
    if (srid && view.getUint32(5, little) !== 4326) return;
    const p = { lng: view.getFloat64(offset, little), lat: view.getFloat64(offset + 8, little) }; if (validPoint(p)) return p;
  } catch { return; }
}
const amount = (v: unknown, currency: string) => { const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : numberValue(v); return n != null && Number.isSafeInteger(n) && n >= 0 ? { amount: n / 100, currency } : undefined; };
export function tripStatus(state: unknown): TripSnapshot['status'] {
  return ({ accepted: 'approaching', arrived_pickup: 'arrived', arriving: 'arrived', arrived: 'arrived', in_trip: 'in_trip', in_progress: 'in_trip', completed: 'completed', cancelled: 'cancelled', withdrawn: 'cancelled' } as Record<string, TripSnapshot['status']>)[String(state)] || 'reassigning';
}
export function normalizeTrip(trip: Row, parts: { profile?: Row | null; driver?: Row | null; vehicle?: Row | null; location?: Row | null; payment?: Row | null; rating?: Row | null; update?: Row | null }, revision: number): TripSnapshot {
  const p = parts.profile || {}, d = parts.driver || {}, v = parts.vehicle || {}, fix = parts.location || {}, pay = parts.payment || {}, rating = parts.rating || {};
  const driverId = textValue(trip.driver_id), status = tripStatus(trip.state), currency = textValue(trip.currency) || 'ETB';
  const received = record(parts.update?.metadata ?? trip.metadata);
  const raw = received.driverId === driverId ? received : {}, route = record(raw.route), metrics = record(raw.metrics);
  const points = Array.isArray(route.points) && route.points.length > 1 && route.points.every(validPoint) ? route.points as Point[] : undefined;
  const location = geography(fix.location), updatedAt = timestamp(fix.recorded_at ?? fix.updated_at), requestedAt = timestamp(trip.requested_at) || 0;
  const matchingActor = driverId && (fix.actor_id === driverId || fix.driver_id === driverId);
  const active = ['approaching', 'arrived', 'in_trip'].includes(status);
  const tracking = active && matchingActor && location && updatedAt != null && updatedAt >= requestedAt && updatedAt <= Date.now() + 5000 ? {
    ...location, driverId, updatedAt, accuracyMeters: numberValue(fix.accuracy_m),
    etaMinutes: numberValue(metrics.pickupMinutes), etaUpdatedAt: timestamp(metrics.updatedAt), route: points,
  } : null;
  const score = numberValue(rating.score), ratingValue = score && Number.isInteger(score) && score >= 1 && score <= 5 ? { status: 'submitted' as const, score } : undefined;
  const verifiedAt = timestamp(d.verified_at);
  const displayDriver = driverId && status !== 'reassigning' && status !== 'cancelled' ? {
    id: driverId, name: textValue(p.full_name), photo: textValue(p.avatar_url), contactPhone: textValue(p.phone),
    rating: numberValue(d.rating), tripCount: numberValue(d.completed_trips),
    vehicle: { model: [textValue(v.make), textValue(v.model)].filter(Boolean).join(' ') || undefined, color: textValue(v.color), plate: textValue(v.plate_number ?? v.license_plate ?? v.plate) },
    verification: d.review_status === 'approved' && verifiedAt ? { status: 'verified' as const, source: 'driver_review', verifiedAt } : undefined,
  } : null;
  return {
    id: String(trip.id), revision, status, category: textValue(trip.service_type), driver: displayDriver,
    pickup: { ...geography(trip.pickup), name: textValue(trip.pickup_address), instructions: textValue(trip.pickup_instructions) },
    destination: { ...geography(trip.destination), name: textValue(trip.destination_address) }, tracking,
    route: points && textValue(route.id) ? { id: route.id as string, points } : undefined,
    metrics: timestamp(metrics.updatedAt) != null ? { arrivalAt: timestamp(metrics.arrivalAt), remainingMeters: numberValue(metrics.remainingMeters), updatedAt: timestamp(metrics.updatedAt)! } : undefined,
    delayedArrival: raw.delayedArrival === true, fare: amount(trip.total_minor, currency),
    finalAmount: status === 'completed' ? amount(trip.actual_fare_minor ?? trip.total_minor, currency) : undefined,
    completedAt: timestamp(trip.completed_at),
    payment: { status: pay.status === 'paid' ? 'paid' : ['pending', 'authorized'].includes(String(pay.status)) ? 'pending' : pay.status === 'failed' ? 'failed' : 'unknown', method: textValue(pay.provider) }, rating: ratingValue,
  };
}
// A stale query must not resurrect terminal trips or move a reported fix backwards.
export function mergeTrip(previous: TripSnapshot | null, next: TripSnapshot): TripSnapshot {
  if (!previous || previous.id !== next.id) return next;
  if (next.revision <= previous.revision || (['completed', 'cancelled'].includes(previous.status) && previous.status !== next.status)) return previous;
  if (previous.driver?.id === next.driver?.id && previous.tracking && ['approaching','arrived','in_trip'].includes(next.status) && (!next.tracking || next.tracking.updatedAt <= previous.tracking.updatedAt)) return { ...next, tracking: previous.tracking };
  return next;
}

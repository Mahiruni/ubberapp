import { validPoint, type Point } from './nexride-trip-data';

export type MatchingProgress = {
  requestedAt: string;
  phase: 'searching' | 'waiting' | 'assigned' | 'no_drivers' | 'cancelled';
  deliveredAt: string | null;
  attempts: number;
  observedAt: number;
};

// Timestamps describe recorded events. Offer expiry never implies that the
// entire search expired: Biloo can forward the request to another Driver.
export function matchingProgress(
  ride: { created_at: string; status: string; dispatch_state: string },
  offers: { status: string; created_at: string; expires_at: string | null }[],
  now = Date.now(),
): MatchingProgress {
  const waiting = offers.find(o => o.status === 'pending' &&
    (!o.expires_at || Date.parse(o.expires_at) > now));
  return {
    requestedAt: ride.created_at,
    phase: ['accepted', 'arrived_pickup', 'in_trip', 'completed'].includes(ride.status)
      ? 'assigned' : ['cancelled', 'withdrawn'].includes(ride.status) ? 'cancelled'
      : ride.dispatch_state === 'no_drivers' ? 'no_drivers' : waiting ? 'waiting' : 'searching',
    deliveredAt: waiting?.created_at || null,
    attempts: offers.length,
    observedAt: now,
  };
}

export function freshDriverFix(updatedAt: number, now = Date.now()) {
  return Number.isFinite(updatedAt) && now - updatedAt >= -5000 && now - updatedAt <= 45_000;
}

export type LiveJourneyRoute = {
  tripId: string;
  driverId: string;
  target: 'pickup' | 'destination';
  points: Point[];
  durationSeconds: number;
  distanceMeters: number;
  generatedAt: number;
  fixAt: number;
};

export function parseLiveJourneyRoute(value: unknown): LiveJourneyRoute | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.tripId !== 'string' || typeof v.driverId !== 'string' ||
    !['pickup', 'destination'].includes(String(v.target)) ||
    !Array.isArray(v.points) || v.points.length < 2 || !v.points.every(validPoint) ||
    ![v.durationSeconds, v.distanceMeters, v.generatedAt, v.fixAt].every(n =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null;
  return v as LiveJourneyRoute;
}

export function elapsedLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

// Confirmed snapshots are the only source of live matching/driver state.
import type { RideFare } from './nexride-booking';
import type { Journey } from './nexride-journey';
export type MatchStatus = 'searching' | 'delayed' | 'no_drivers' | 'cancelled' | 'assigned';
export type MatchSnapshot = {
  requestId: string;
  version: number;
  status: MatchStatus;
  cancellation: { allowed: boolean; requiresConfirmation: boolean; fee: number | null; reason: string | null };
  canRetry: boolean;
  canChangeCategory: boolean;
  driver?: { name: string; vehicle: string; plate: string; pickupMinutes: number | null };
};
export type MatchRequest = {
  requestId: string;
  source: 'preview' | 'service';
  fare: RideFare;
  journey: Pick<Journey, 'pickup' | 'destination' | 'routeState'>;
};
export function validMatch(value: unknown, requestId: string): value is MatchSnapshot {
  const v = value as MatchSnapshot | null;
  const c = v?.cancellation;
  const d = v?.driver;
  return !!v && v.requestId === requestId && Number.isSafeInteger(v.version) && v.version >= 0 &&
    ['searching', 'delayed', 'no_drivers', 'cancelled', 'assigned'].includes(v.status) &&
    typeof v.canRetry === 'boolean' && typeof v.canChangeCategory === 'boolean' &&
    // A category change must never create a second request while one is active.
    (!v.canChangeCategory || ['no_drivers', 'cancelled'].includes(v.status)) &&
    (!v.canRetry || v.status === 'no_drivers') && !!c && typeof c.allowed === 'boolean' &&
    typeof c.requiresConfirmation === 'boolean' && (c.fee === null || Number.isFinite(c.fee) && c.fee >= 0) &&
    (c.reason === null || typeof c.reason === 'string') &&
    (v.status !== 'assigned' || !!d && typeof d.name === 'string' && !!d.name.trim() &&
      typeof d.vehicle === 'string' && !!d.vehicle.trim() && typeof d.plate === 'string' && !!d.plate.trim() &&
      ((d.pickupMinutes === undefined || d.pickupMinutes === null) || Number.isFinite(d.pickupMinutes) && d.pickupMinutes >= 0));
}
export function normalizeMatch(value: unknown, requestId: string): MatchSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const rawDriver = raw.driver, rawCancellation = raw.cancellation;
  const normalized = {
    ...raw,
    // Repair snapshots produced by old deployments which omitted null fields.
    ...(rawCancellation && typeof rawCancellation === 'object'
      ? { cancellation: { reason: null, ...(rawCancellation as Record<string, unknown>) } }
      : {}),
    ...(rawDriver && typeof rawDriver === 'object'
      ? { driver: { pickupMinutes: null, ...(rawDriver as Record<string, unknown>) } }
      : {}),
  };
  return validMatch(normalized, requestId) ? normalized as MatchSnapshot : null;
}
export function newerMatch(current: MatchSnapshot | null, next: MatchSnapshot) {
  if (!current) return next;
  if (next.requestId !== current.requestId || next.version <= current.version || current.status === 'cancelled') return current;
  // Assignment cannot regress to searching because of a stale dispatch response.
  if (current.status === 'assigned' && next.status !== 'assigned' && next.status !== 'cancelled') return current;
  return next;
}
export const matchingAdapter = {
  async read(requestId: string, signal: AbortSignal): Promise<MatchSnapshot> {
    const { nexrideApiFetch } = await import('./nexride-api-auth');
    const response = await nexrideApiFetch(
      '/api/rider/requests/' + encodeURIComponent(requestId),
      { cache: 'no-store', signal },
    );
    const value = await response.json();
    const normalized = normalizeMatch(value, requestId);
    if (!response.ok || !normalized) throw new Error('matching_unavailable');
    return normalized;
  },
  async action(snapshot: MatchSnapshot, action: 'cancel' | 'retry', signal: AbortSignal): Promise<MatchSnapshot> {
    const { nexrideApiFetch } = await import('./nexride-api-auth');
    const response = await nexrideApiFetch(
      '/api/rider/requests/' + encodeURIComponent(snapshot.requestId),
      {
        method: 'POST',
        cache: 'no-store',
        signal,
        headers: {
          'Idempotency-Key':
            snapshot.requestId + ':' + snapshot.version + ':' + action,
        },
        body: JSON.stringify({ action, expectedVersion: snapshot.version }),
      },
    );
    const value = await response.json();
    const normalized = normalizeMatch(value, snapshot.requestId);
    // A conflict may return a newer authoritative state (e.g. driver accepted during cancellation).
    if ((!response.ok && response.status !== 409) || !normalized) throw new Error('action_unknown');
    return normalized;
  },
};

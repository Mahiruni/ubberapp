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
    (!v.canChangeCategory || ['no_drivers', 'cancelled'].includes(v.status)) &&
    (!v.canRetry || v.status === 'no_drivers') && !!c && typeof c.allowed === 'boolean' &&
    typeof c.requiresConfirmation === 'boolean' && (c.fee === null || Number.isFinit¶»§q«^
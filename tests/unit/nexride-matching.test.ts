import { describe, expect, it } from 'vitest';
import { newerMatch, normalizeMatch, validMatch, type MatchSnapshot } from '../../lib/nexride-matching';
const snapshot = (status: MatchSnapshot['status'] = 'searching', version = 1): MatchSnapshot => ({
  requestId: 'request-1', version, status,
  cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null },
  canRetry: false, canChangeCategory: false,
});
describe('confirmed matching snapshots', () => {
  it('requires a confirmed driver for acceptance, never a request receipt', () => {
    expect(validMatch({ status: 'accepted', requestId: 'request-1' }, 'request-1')).toBe(false);
    expect(validMatch(snapshot('assigned'), 'request-1')).toBe(false);
    expect(validMatch({ ...snapshot('assigned'), driver: { name: 'Confirmed Driver', vehicle: 'Sedan', plate: 'ABC-1', pickupMinutes: null } }, 'request-1')).toBe(true);
  });
  it('normalizes an omitted pickup ETA to null instead of reporting a false connection failure', () => {
    const raw = {
      ...snapshot('assigned'),
      driver: { name: 'Confirmed Driver', vehicle: 'Sedan', plate: 'ABC-1' },
    };
    const normalized = normalizeMatch(raw, 'request-1');
    expect(normalized?.driver?.pickupMinutes).toBeNull();
  });
  it('rejects mismatched IDs, invalid versions/fees and duplicate request capabilities', () => {
    expect(validMatch(snapshot(), 'other')).toBe(false);
    expect(validMatch({ ...snapshot(), version: NaN }, 'request-1')).toBe(false);
    expect(validMatch({ ...snapshot(), cancellation: { ...snapshot().cancellation, fee: -5 } }, 'request-1')).toBe(false);
    expect(validMatch({ ...snapshot(), canChangeCategory: true }, 'request-1')).toBe(false);
    expect(validMatch({ ...snapshot(), canRetry: true }, 'request-1')).toBe(false);
  });
  it('ignores stale updates and cannot regress assignment to searching', () => {
    const assigned = snapshot('assigned', 3);
    expect(newerMatch(assigned, snapshot('searching', 2))).toBe(assigned);
    expect(newerMatch(assigned, snapshot('searching', 4))).toBe(assigned);
    expect(newerMatch(assigned, snapshot('cancelled', 4)).status).toBe('cancelled');
  });
  it('never revives a confirmed cancelled request', () => {
    const cancelled = snapshot('cancelled', 5);
    expect(newerMatch(cancelled, snapshot('searching', 6))).toBe(cancelled);
    expect(newerMatch(snapshot(), { ...snapshot('delayed', 2), requestId: 'other' }).status).toBe('searching');
  });
});

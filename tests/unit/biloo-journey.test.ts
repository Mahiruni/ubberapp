import { describe, expect, it } from 'vitest';
import { elapsedLabel, freshDriverFix, matchingProgress, parseLiveJourneyRoute } from '../../lib/biloo-journey';
import { newerMatch, type MatchSnapshot } from '../../lib/nexride-matching';
const now = Date.now();
const ride = { created_at: new Date(now - 90_000).toISOString(), status: 'pending', dispatch_state: 'searching' };
describe('Biloo journey truthfulness and recovery', () => {
  it('shows searching until a persisted, unexpired offer exists', () => {
    expect(matchingProgress(ride, [], now).phase).toBe('searching');
    const offered = matchingProgress(ride, [{ status: 'pending', created_at: ride.created_at, expires_at: new Date(now + 10_000).toISOString() }], now);
    expect(offered.phase).toBe('waiting'); expect(offered.deliveredAt).toBe(ride.created_at);
  });
  it('does not turn an expired driver offer into an expired entire search', () => {
    const result = matchingProgress(ride, [{ status: 'pending', created_at: ride.created_at, expires_at: new Date(now - 1).toISOString() }], now);
    expect(result.phase).toBe('searching'); expect(result.deliveredAt).toBeNull();
    expect(matchingProgress({ ...ride, dispatch_state: 'no_drivers' }, [], now).phase).toBe('no_drivers');
  });
  it('recognizes backend assignment and cancellation independently of offers', () => {
    expect(matchingProgress({ ...ride, status: 'accepted' }, [], now).phase).toBe('assigned');
    expect(matchingProgress({ ...ride, status: 'cancelled' }, [], now).phase).toBe('cancelled');
  });
  it('rejects stale and future GPS fixes before presenting ETAs', () => {
    expect(freshDriverFix(now - 44_000, now)).toBe(true);
    expect(freshDriverFix(now - 46_000, now)).toBe(false);
    expect(freshDriverFix(now + 6000, now)).toBe(false);
    expect(freshDriverFix(NaN, now)).toBe(false);
  });
  it('validates provider route geometry and numerical metrics', () => {
    const route = { tripId: 't', driverId: 'd', target: 'pickup', points: [{ lat: 9, lng: 38.7 }, { lat: 9.1, lng: 38.8 }], durationSeconds: 420, distanceMeters: 1800, generatedAt: now, fixAt: now };
    expect(parseLiveJourneyRoute(route)).toEqual(route);
    expect(parseLiveJourneyRoute({ ...route, points: [{ lat: 190, lng: 2 }] })).toBeNull();
    expect(parseLiveJourneyRoute({ ...route, durationSeconds: -10 })).toBeNull();
    expect(parseLiveJourneyRoute({ ...route, target: 'fake' })).toBeNull();
  });
  it('accepts newer delivery metadata at the same trip version without regressing assignment', () => {
    const current: MatchSnapshot = { requestId: 't', version: 4, status: 'searching', cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null }, canRetry: false, canChangeCategory: false };
    const progress = matchingProgress(ride, [], now);
    expect(newerMatch(current, { ...current, progress }).progress).toEqual(progress);
    const assigned = { ...current, status: 'assigned' as const };
    expect(newerMatch(assigned, { ...current, version: 5, progress })).toBe(assigned);
    expect(newerMatch({ ...current, progress }, { ...current, progress: { ...progress, observedAt: now - 1 } }).progress?.observedAt).toBe(now);
  });
  it('renders an elapsed time, with no pretend countdown or negative time', () => {
    expect(elapsedLabel(90)).toBe('1:30'); expect(elapsedLabel(-40)).toBe('0:00');
  });
});

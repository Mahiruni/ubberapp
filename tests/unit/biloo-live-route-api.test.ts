import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), route: vi.fn() }));
vi.mock('../../lib/nexride-server-supabase', () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock('../../lib/location', () => ({ routeBetween: mocks.route }));
import { GET } from '../../app/api/rider/trips/[tripId]/route/route';
const now = Date.now();
const ride = { id: 'trip-1', status: 'accepted', assigned_driver_id: 'driver-1', pickup_lat: 9.01, pickup_lng: 38.77, destination_lat: 8.98, destination_lng: 38.8 };
const fix = { latitude: 9.02, longitude: 38.78, recorded_at: new Date(now).toISOString() };
const request = new Request('http://localhost/api/rider/trips/trip-1/route');
const context = { params: Promise.resolve({ tripId: 'trip-1' }) };
function database(first: unknown = ride, location: unknown = fix, second: unknown = ride) {
  const results = [first, location, second];
  const eq = vi.fn();
  const from = vi.fn(() => {
    const data = results.shift();
    const query = { select: () => query, eq: (...args: unknown[]) => { eq(...args); return query; }, maybeSingle: async () => ({ data, error: null }) };
    return query;
  });
  mocks.authorize.mockResolvedValue({ user: { id: 'rider-1' }, client: { from } });
  return { from, eq };
}
beforeEach(() => {
  mocks.authorize.mockReset(); mocks.route.mockReset().mockResolvedValue({ provider: 'mapbox', distanceMeters: 1200, durationSeconds: 240, geometry: [[9.02, 38.78], [9.01, 38.77]] });
  database();
});
describe('Authorized live Rider route API', () => {
  it('uses only the assigned Driver fix and the stored pickup', async () => {
    const db = database(); const response = await GET(request, context), body = await response.json();
    expect(response.status).toBe(200);
    expect(body.route).toMatchObject({ tripId: 'trip-1', driverId: 'driver-1', target: 'pickup', durationSeconds: 240, distanceMeters: 1200 });
    expect(db.eq).toHaveBeenCalledWith('rider_id', 'rider-1');
    expect(db.eq).toHaveBeenCalledWith('driver_id', 'driver-1');
    expect(mocks.route.mock.calls[0][0]).toEqual([{ lat: 9.02, lng: 38.78 }, { lat: 9.01, lng: 38.77 }]);
  });
  it('rejects missing sessions and other riders trips', async () => {
    mocks.authorize.mockResolvedValue(null); expect((await GET(request, context)).status).toBe(401);
    database(null); expect((await GET(request, context)).status).toBe(404); expect(mocks.route).not.toHaveBeenCalled();
  });
  it('does not route a stale or future Driver fix', async () => {
    for (const offset of [-60_000, 60_000]) {
      database(ride, { ...fix, recorded_at: new Date(now + offset).toISOString() });
      expect((await GET(request, context)).status).toBe(409);
    }
    expect(mocks.route).not.toHaveBeenCalled();
  });
  it('does not infer zero coordinates from absent location data', async () => {
    database(ride, { ...fix, latitude: null });
    expect((await GET(request, context)).status).toBe(422); expect(mocks.route).not.toHaveBeenCalled();
  });
  it('discards a route if cancellation or reassignment occurred during provider lookup', async () => {
    database(ride, fix, { ...ride, status: 'cancelled' });
    expect((await GET(request, context)).status).toBe(409);
    database(ride, fix, { ...ride, assigned_driver_id: 'other' });
    expect((await GET(request, context)).status).toBe(409);
  });
  it('uses destination routing only during an authoritative in-trip state', async () => {
    database({ ...ride, status: 'in_trip' }, fix, { ...ride, status: 'in_trip' });
    const body = await (await GET(request, context)).json(); expect(body.route.target).toBe('destination');
    database({ ...ride, status: 'completed' }); expect((await GET(request, context)).status).toBe(409);
  });
  it('returns a retryable failure without inventing a fallback ETA', async () => {
    mocks.route.mockRejectedValue(new Error('Mapbox unavailable'));
    const response = await GET(request, context); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'route_unavailable' });
  });
});

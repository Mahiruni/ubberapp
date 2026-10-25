import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), user: vi.fn() }));
vi.mock('../../lib/nexride-server-supabase', () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock('../../lib/nexride-server-admin', () => ({ serverAdminSupabase: () => ({ from: mocks.from, auth: { admin: { getUserById: mocks.user } } }) }));
import { GET as nearby } from '../../app/api/rider/nearby-drivers/route';
import { GET as shared } from '../../app/api/trip-share/public/[token]/route';
import { invalidateDriverAvatarMetadata } from '../../lib/biloo-driver-map-avatar-server';

const driverId = '22222222-2222-4222-8222-222222222222';
const riderId = '33333333-3333-4333-8333-333333333333';
const token = 'a'.repeat(43);
let busy = false, expired = false, stale = false;
beforeEach(() => {
  vi.clearAllMocks(); invalidateDriverAvatarMetadata(driverId); busy = false; expired = false; stale = false;
  mocks.authorize.mockResolvedValue({ user: { id: riderId } });
  mocks.user.mockResolvedValue({ error: null, data: { user: { email: 'private@example.test', user_metadata: { vehicle: 'BYD Tang L', vehicle_body_type: 'suv', biloo_driver_map_avatar: { style: 'goldline' }, phone: 'PRIVATE' } } } });
  mocks.from.mockImplementation(table => {
    const list = table === 'drivers' ? [{ id: driverId, vehicle: 'BYD Tang L', vehicle_color: 'Beige', vehicle_plate: 'PRIVATE-PLATE', location: { latitude: 9.01, longitude: 38.77 }, gps_recorded_at: new Date(Date.now() - (stale ? 120_000 : 1000)).toISOString(), gps_accuracy_meters: 8 }]
      : table === 'profiles' ? [{ id: driverId }]
      : table === 'ride_requests' && busy ? [{ assigned_driver_id: driverId }] : [];
    const single = table === 'profiles' ? { role: 'rider', account_status: 'active' }
      : table === 'drivers' ? list[0]
      : table === 'nexride_trip_share_links' ? { trip_id: 'trip', expires_at: new Date(Date.now() + (expired ? -1000 : 60_000)).toISOString() }
      : table === 'ride_requests' ? { id: 'trip', status: 'in_trip', assigned_driver_id: driverId, pickup_location: 'Bole', destination_location: 'Meskel Square', ride_category: 'economy' }
      : table === 'ride_driver_locations' ? { latitude: 9.01, longitude: 38.77, accuracy_meters: 8, recorded_at: new Date().toISOString() } : null;
    const q: Record<string, unknown> = {};
    for (const name of ['select','eq','in','gte','lte','order','limit']) q[name] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => ({ error: null, data: single }));
    q.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null, data: list }).then(resolve);
    return q;
  });
});
describe('Biloo avatar distribution boundaries', () => {
  it('shows the saved finish and registered paint on nearby cars without exposing identity', async () => {
    const response = await nearby(new Request('https://example.test/api/rider/nearby-drivers?lat=9.01&lng=38.77'));
    const body = await response.json(); expect(response.status).toBe(200); expect(body.vehicles).toHaveLength(1);
    expect(body.vehicles[0].avatar).toEqual({ bodyType: 'suv', color: 'Beige', style: 'goldline' });
    expect(body.vehicles[0].key).toHaveLength(20);
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|private@example|BYD Tang|22222222/);
  });
  it('resolves preferences only after eligibility and real GPS freshness checks', async () => {
    busy = true; expect((await (await nearby(new Request('https://example.test/api/rider/nearby-drivers?lat=9.01&lng=38.77'))).json()).vehicles).toEqual([]);
    busy = false; stale = true; expect((await (await nearby(new Request('https://example.test/api/rider/nearby-drivers?lat=9.01&lng=38.77'))).json()).vehicles).toEqual([]);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it('keeps location supply available when optional cosmetic preferences cannot load', async () => {
    mocks.user.mockRejectedValueOnce(new Error('temporary auth outage'));
    const body = await (await nearby(new Request('https://example.test/api/rider/nearby-drivers?lat=9.01&lng=38.77'))).json();
    expect(body.vehicles[0].avatar).toEqual({ bodyType: 'suv', color: 'Beige', style: 'signature' });
  });
  it('shares only the same car appearance with a valid active trip capability', async () => {
    const body = await (await shared(new Request('https://example.test/api/trip-share/public/'+token), { params: Promise.resolve({ token }) })).json();
    expect(body.driverAvatar).toEqual({ bodyType: 'suv', color: 'Beige', style: 'goldline' });
    expect(body.driverLocation).toMatchObject({ lat: 9.01, lng: 38.77 });
    expect(JSON.stringify(body)).not.toMatch(/PRIVATE|private@example|BYD Tang|22222222/);
  });
  it('does not disclose appearance after a share expires', async () => {
    expired = true;
    expect((await shared(new Request('https://example.test/api/trip-share/public/'+token), { params: Promise.resolve({ token }) })).status).toBe(410);
    expect(mocks.user).not.toHaveBeenCalled();
  });
});

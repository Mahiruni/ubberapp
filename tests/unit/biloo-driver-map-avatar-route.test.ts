import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), update: vi.fn() }));
vi.mock('../../lib/nexride-server-supabase', () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock('../../lib/nexride-server-admin', () => ({ serverAdminSupabase: () => ({ from: mocks.from, auth: { admin: { updateUserById: mocks.update } } }) }));
import { GET, PATCH } from '../../app/api/driver/map-avatar/route';
const driverId = '22222222-2222-4222-8222-222222222222';
let role = 'driver', accountStatus = 'active', color = 'Beige';
const request = (body: unknown) => new Request('https://example.test/api/driver/map-avatar', { method: 'PATCH', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); role = 'driver'; accountStatus = 'active'; color = 'Beige';
  mocks.authorize.mockResolvedValue({ user: { id: driverId, user_metadata: { full_name: 'Driver', vehicle: 'BYD Tang L', vehicle_body_type: 'suv', biloo_driver_map_avatar: { style: 'executive' } } } });
  mocks.from.mockImplementation(table => {
    const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }; q.select.mockReturnValue(q); q.eq.mockReturnValue(q);
    q.maybeSingle.mockResolvedValue({ error: null, data: table === 'profiles' ? { role, account_status: accountStatus } : { vehicle: 'BYD Tang L', vehicle_color: color } }); return q;
  });
  mocks.update.mockImplementation(async (_id, patch) => ({ error: null, data: { user: { user_metadata: patch.user_metadata } } }));
});
describe('Driver avatar preferences API', () => {
  it('loads the saved finish with registered body and paint', async () => {
    const body = await (await GET(new Request('https://example.test/api/driver/map-avatar'))).json();
    expect(body).toMatchObject({ status: 'ready', avatar: { bodyType: 'suv', color: 'Beige', style: 'executive' }, complete: true });
  });
  it('saves only the current driver’s finish and preserves the registered vehicle', async () => {
    const result = await PATCH(request({ style: 'goldline' }));
    expect(result.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(driverId, { user_metadata: { biloo_driver_map_avatar: { style: 'goldline' } } });
    expect((await result.json()).avatar).toEqual({ bodyType: 'suv', color: 'Beige', style: 'goldline' });
  });
  it('rejects untrusted avatars and attempts to change body, color or another driver', async () => {
    for (const body of [{ style: 'remote-image' }, { style: 'signature', color: 'Black' }, { style: 'signature', bodyType: 'van' }, { style: 'signature', driverId: 'someone-else' }, [], null]) expect((await PATCH(request(body))).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('requires an authenticated active driver', async () => {
    mocks.authorize.mockResolvedValueOnce(null); expect((await PATCH(request({ style: 'goldline' }))).status).toBe(401);
    role = 'rider'; expect((await PATCH(request({ style: 'goldline' }))).status).toBe(403);
    role = 'driver'; accountStatus = 'suspended'; expect((await PATCH(request({ style: 'goldline' }))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not confirm unsaved choices after a storage failure or incomplete registration', async () => {
    mocks.update.mockResolvedValueOnce({ error: { message: 'offline' }, data: { user: null } });
    expect((await PATCH(request({ style: 'goldline' }))).status).toBe(503);
    color = ''; expect((await PATCH(request({ style: 'goldline' }))).status).toBe(409);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});

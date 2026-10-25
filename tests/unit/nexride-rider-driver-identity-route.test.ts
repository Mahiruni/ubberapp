import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), signed: vi.fn(), photoFrom: vi.fn(), user: vi.fn() }));
vi.mock('../../lib/nexride-server-supabase', () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock('../../lib/nexride-server-admin', () => ({ serverAdminSupabase: () => ({ from: mocks.from, auth: { admin: { getUserById: mocks.user } } }) }));
import { GET } from '../../app/api/rider/trips/[tripId]/driver/route';
const id='33333333-3333-4333-8333-333333333333', driver='22222222-2222-4222-8222-222222222222', rider='11111111-1111-4111-8111-111111111111';
let status='accepted', own=true;
function query(result: unknown) {
  const q: Record<string, unknown> = {}; for (const key of ['select','eq']) q[key]=vi.fn(() => q);
  q.maybeSingle=vi.fn(async () => ({ data: result, error: null }));
  q.then=(resolve: (r: unknown) => unknown) => Promise.resolve({ data:result, error:null, count:7 }).then(resolve);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks(); status='accepted'; own=true;
  mocks.authorize.mockResolvedValue({ user:{ id:rider }, client:{ from:mocks.photoFrom, storage:{ from: () => ({ createSignedUrl:mocks.signed }) } } });
  mocks.from.mockImplementation(table => query(table==='ride_requests' ? (own ? { id,rider_id:rider,assigned_driver_id:driver,status } : null) : table==='profiles' ? { full_name:'Connected Driver',phone:'+251900000001' } : { vehicle:'Toyota Yaris',vehicle_color:'Silver',vehicle_plate:'REAL-123',review_status:'approved',reviewed_at:'2026-01-01',rating:4.8 }));
  mocks.photoFrom.mockImplementation(() => query({ storage_path:`${driver}/portrait.jpg` }));
  mocks.signed.mockResolvedValue({ data:{ signedUrl:'https://example.test/private-portrait?token=signed' },error:null });
  mocks.user.mockResolvedValue({ data:{ user:{ user_metadata:{ avatar_url:'https://example.test/old-photo.jpg' } } } });
});
const read=()=>GET(new Request(`https://example.test/api/rider/trips/${id}/driver`),{params:Promise.resolve({tripId:id})});
describe('Assigned driver identity route', () => {
  it('requires authentication and rider-owned trip before disclosing identity',async()=>{
    mocks.authorize.mockResolvedValueOnce(null); expect((await read()).status).toBe(401);
    own=false; expect((await read()).status).toBe(404); expect(mocks.signed).not.toHaveBeenCalled();
  });
  it('returns only the scoped private portrait and real assigned vehicle',async()=>{
    const response=await read(), body=await response.json(); expect(body.driver.id).toBe(driver);
    expect(body.driver.photo).toContain('private-portrait'); expect(body.driver.vehicle.plate).toBe('REAL-123');
    expect(mocks.signed).toHaveBeenCalledWith(`${driver}/portrait.jpg`,300);
    expect(body.driver.vehicle.mapAvatar).toEqual({bodyType:'hatchback',color:'Silver',style:'signature'});
  });
  it('passes the same saved Biloo livery to the assigned Rider without changing vehicle color',async()=>{
    mocks.user.mockResolvedValue({data:{user:{user_metadata:{vehicle:'Toyota Yaris',vehicle_body_type:'hatchback',biloo_driver_map_avatar:{style:'goldline',color:'Red'}}}}});
    const body=await(await read()).json();
    expect(body.driver.vehicle.mapAvatar).toEqual({bodyType:'hatchback',color:'Silver',style:'goldline'});
  });
  it('never resurrects a deleted portrait using editable auth metadata',async()=>{
    mocks.photoFrom.mockImplementation(() => query(null)); expect((await (await read()).json()).driver.photo).toBeNull();
  });
  it('stops exposing driver identity for cancelled and unaccepted assignments',async()=>{
    for(const value of ['cancelled','searching','withdrawn']) { status=value; expect((await (await read()).json()).driver).toBeNull(); }
    expect(mocks.signed).not.toHaveBeenCalled();
  });
  it('removes the contact workflow after trip completion',async()=>{
    status='completed'; expect((await (await read()).json()).driver.phone).toBeNull();
  });
});

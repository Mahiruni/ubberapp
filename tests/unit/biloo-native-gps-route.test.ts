import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks=vi.hoisted(()=>({authorize:vi.fn(),admin:vi.fn(),mirror:vi.fn()}));
vi.mock('../../lib/nexride-server-supabase',()=>({authorizedRequestSupabase:mocks.authorize}));
vi.mock('../../lib/nexride-server-admin',()=>({serverAdminSupabase:mocks.admin}));
vi.mock('../../lib/biloo-native-trip-location',()=>({publishNativeTripLocation:mocks.mirror}));
import { POST } from '../../app/api/driver/availability/route';

const driver={review_status:'approved',is_online:true,rating:5,vehicle:'BYD Tang L',vehicle_plate:'TEST',gps_recorded_at:new Date().toISOString(),last_presence_at:new Date().toISOString(),gps_accuracy_meters:12};
const profile={role:'driver',account_status:'active'};
function request(body:unknown) { return new Request('https://biloo.test/api/driver/availability',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer test-only'},body:JSON.stringify(body)}); }
function fix() {return {latitude:9.008,longitude:38.775,accuracy:12,fix_timestamp:Date.now(),heading_degrees:90};}
beforeEach(()=>{
  vi.clearAllMocks();
  driver.is_online=true; driver.review_status='approved'; profile.role='driver'; profile.account_status='active';
  mocks.authorize.mockResolvedValue({user:{id:'driver-a',user_metadata:{vehicle_color:'Beige'}},client:{}});
  mocks.mirror.mockResolvedValue(true);
  const from=vi.fn((name:string)=>{
    const query={select:vi.fn(),eq:vi.fn(),update:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:name==='profiles'?profile:driver,error:null}),single:vi.fn().mockResolvedValue({data:driver,error:null})};
    for(const method of ['select','eq','update'] as const)query[method].mockReturnValue(query);
    return query;
  });
  mocks.admin.mockReturnValue({from,rpc:vi.fn().mockResolvedValue({error:null})});
});
describe('Native GPS availability endpoint',()=>{
  it('requires authentication even with a native marker',async()=>{
    mocks.authorize.mockResolvedValue(null);
    expect((await POST(request({native_tracking:true,location:fix()}))).status).toBe(401);
    expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it('mirrors an authenticated fresh native observation into the active trip',async()=>{
    const response=await POST(request({native_tracking:true,location:fix(),driver_id:'untrusted',ride_request_id:'untrusted'}));
    expect(response.status).toBe(200); expect(mocks.mirror).toHaveBeenCalledOnce();
    expect(mocks.mirror.mock.calls[0][0].user.id).toBe('driver-a'); expect(mocks.mirror.mock.calls[0][2]).toBe(90);
  });
  it('rejects missing/stale timestamps and inaccurate native coordinates before writing',async()=>{
    for(const location of [{...fix(),fix_timestamp:undefined},{...fix(),fix_timestamp:Date.now()-40000},{...fix(),accuracy:151}])
      expect((await POST(request({native_tracking:true,location}))).status).toBe(422);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it('keeps the legacy foreground API behavior without a native marker',async()=>{
    const location={...fix(),fix_timestamp:undefined};
    expect((await POST(request({location}))).status).toBe(200); expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it('does not bypass Offline, approval or account-state gates for native tracking',async()=>{
    driver.is_online=false;
    expect((await POST(request({native_tracking:true,location:fix()}))).status).toBe(409);
    driver.is_online=true; driver.review_status='pending';
    expect((await POST(request({native_tracking:true,location:fix()}))).status).toBe(409);
    driver.review_status='approved'; profile.account_status='suspended';
    expect((await POST(request({native_tracking:true,location:fix()}))).status).toBe(403);
    expect(mocks.mirror).not.toHaveBeenCalled();
  });
  it('does not acknowledge a tracking update when the trip write fails',async()=>{
    mocks.mirror.mockResolvedValue(false);
    const response=await POST(request({native_tracking:true,location:fix()}));
    expect(response.status).toBe(503); expect((await response.json()).status).toBe('trip_location_update_failed');
  });
});

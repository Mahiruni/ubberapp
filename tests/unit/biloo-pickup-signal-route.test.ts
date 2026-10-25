import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), adminFrom: vi.fn(), user: vi.fn(), insert: vi.fn() }));
vi.mock('../../lib/nexride-server-supabase', () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock('../../lib/nexride-server-admin', () => ({ serverAdminSupabase: () => ({ from: mocks.adminFrom, auth: { admin: { getUserById: mocks.user } } }) }));
import { GET, POST } from '../../app/api/trips/[tripId]/pickup-signal/route';
import { PICKUP_SIGNAL_MESSAGE } from '../../lib/biloo-rider-motion';

const tripId='33333333-3333-4333-8333-333333333333', rider='11111111-1111-4111-8111-111111111111', driver='22222222-2222-4222-8222-222222222222', nonce='44444444-4444-4444-8444-444444444444';
let viewer = rider, status = 'accepted', assigned: string | null = driver;
let message: { id: string; created_at: string } | null = null, saved: unknown, readError = false, insertError: { code: string } | null = null;
let queries: { table: string; filters: [string, unknown][] }[];
function query(table: string, admin = false) {
  const entry = { table, filters: [] as [string, unknown][] }; queries.push(entry);
  const q: Record<string, any> = {};
  q.select = q.order = q.limit = () => q;
  q.eq = (key: string, value: unknown) => { entry.filters.push([key, value]); return q; };
  q.insert = (body: unknown) => { saved=body; mocks.insert(body); return q; };
  q.single = async () => ({ data: insertError ? null : { id: nonce, created_at: new Date().toISOString() }, error: insertError });
  q.maybeSingle = async () => table === 'ride_requests' ? { data: { id:tripId, rider_id:rider, assigned_driver_id:assigned, status },error:null } : admin ? { data:null,error:{code:'PGRST205'} } : { data:message,error:readError ? {code:'unavailable'} : null };
  return q;
}
beforeEach(() => {
  vi.clearAllMocks(); viewer=rider; status='accepted'; assigned=driver; message=null; saved=null; queries=[]; readError=false; insertError=null;
  mocks.from.mockImplementation(table=>query(table)); mocks.adminFrom.mockImplementation(table=>query(table,true));
  mocks.authorize.mockImplementation(async()=>({user:{id:viewer},client:{from:mocks.from}}));
  mocks.user.mockResolvedValue({data:{user:{user_metadata:{biloo_rider_map_avatar:{preset:8,skin:3,hair:1,outfit:4},email:'private@example.test'}}},error:null});
});
const context = () => ({params:Promise.resolve({tripId})});
const read = () => GET(new Request(`https://biloo.test/api/trips/${tripId}/pickup-signal`),context());
const send = (body: unknown = {nonce}) => POST(new Request(`https://biloo.test/api/trips/${tripId}/pickup-signal`,{method:'POST',body:JSON.stringify(body)}),context());
describe('Private pickup coordination',()=>{
  it('rejects missing auth, other accounts, reassigned drivers and ended trips',async()=>{
    mocks.authorize.mockResolvedValueOnce(null); expect((await read())?.status).toBe(401);
    viewer=nonce; expect((await read())?.status).toBe(404);
    viewer=driver; assigned=nonce; expect((await read())?.status).toBe(404);
    viewer=rider;
    for (const state of ['searching','in_trip','completed','cancelled']) { status=state; expect((await read())?.status).toBe(409); expect((await send())?.status).toBe(409); }
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('only lets the rider send, using the database sender and timestamp defaults',async()=>{
    viewer=driver; expect((await send())?.status).toBe(403);
    viewer=rider; expect((await send({nonce:'bad'}))?.status).toBe(400);
    expect((await send())?.status).toBe(200);
    expect(saved).toEqual({ride_request_id:tripId,body:PICKUP_SIGNAL_MESSAGE,client_nonce:nonce});
    expect(saved).not.toHaveProperty('sender_id'); expect(saved).not.toHaveProperty('created_at');
  });
  it('projects only normalized artwork and the scoped rider signal to the assigned driver',async()=>{
    viewer=driver; message={id:nonce,created_at:new Date().toISOString()};
    const response=await read(), body=await response!.json();
    expect(body).toEqual({status:'ready',avatar:{preset:8,skin:3,hair:1,outfit:4},signal:{id:nonce,createdAt:message.created_at}});
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(queries.find(q=>q.table==='ride_chat_messages')?.filters).toEqual(expect.arrayContaining([['ride_request_id',tripId],['sender_id',rider],['body',PICKUP_SIGNAL_MESSAGE]]));
  });
  it('deduplicates rapid taps and idempotent retry without optimistic success',async()=>{
    message={id:nonce,created_at:new Date().toISOString()};
    expect((await send())?.status).toBe(200); expect(mocks.insert).not.toHaveBeenCalled();
    message={id:nonce,created_at:new Date(Date.now()-30_000).toISOString()}; insertError={code:'23505'};
    expect((await send())?.status).toBe(200);
    expect(queries.some(q=>q.filters.some(([key,value])=>key==='client_nonce'&&value===nonce))).toBe(true);
    message=null; insertError={code:'42501'}; expect((await send())?.status).toBe(503);
  });
  it('expires old signals and fails closed on chat read failures',async()=>{
    message={id:nonce,created_at:new Date(Date.now()-91_000).toISOString()}; expect((await (await read())!.json()).signal).toBeNull();
    readError=true; expect((await send())?.status).toBe(503); expect(mocks.insert).not.toHaveBeenCalled();
  });
});

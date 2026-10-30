import {generateKeyPairSync} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({admin:vi.fn()}));
vi.mock('../../lib/nexride-server-admin',()=>({serverAdminSupabase:mocks.admin}));
import {GET} from '../../app/api/internal/push-drain/route';
const key=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
const driver='11111111-1111-4111-8111-111111111111',offerId='22222222-2222-4222-8222-222222222222';
let protocol=1,kind='driver_offer',expired=false,online=true,testAge=10000;
let packets:Record<string,any>[]=[];
function chain(data:unknown) {
 const value:{[key:string]:any}={then:(resolve:(r:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
 for(const name of ['select','eq','neq','in','limit','update','delete'])value[name]=vi.fn(()=>value);
 value.maybeSingle=vi.fn(async()=>({data,error:null}));return value;
}
beforeEach(()=>{
 protocol=1;kind='driver_offer';expired=false;online=true;testAge=10000;packets=[];
 vi.stubEnv('NEXRIDE_PUSH_WORKER_SECRET','test-worker-secret-with-enough-length');
 vi.stubEnv('GOOGLE_FCM_SERVICE_ACCOUNT_JSON',JSON.stringify({project_id:'local-test-project',client_email:'worker@example.test',private_key:key}));
 const from=vi.fn((name:string)=>{
  if(name==='nexride_push_outbox')return chain([{id:'queued'}]);
  if(name==='ride_request_offers')return chain({id:offerId,driver_id:driver,request_id:'request',status:'pending',expires_at:new Date(Date.now()+(expired?-1:25000)).toISOString(),created_at:new Date().toISOString(),pickup_distance_km:2,pickup_eta_minutes:4});
  if(name==='drivers')return chain({is_online:online,review_status:'approved'});
  if(name==='profiles')return chain({account_status:'active',full_name:'Test rider'});
  if(name==='ride_requests')return chain({rider_id:'rider',status:'searching',assigned_driver_id:null,pickup_location:'Test pickup',estimated_driver_payout_etb:300});
  if(name==='nexride_push_devices')return chain([{id:'device',fcm_token:'synthetic-local-token',alert_protocol:protocol}]);
  throw new Error('Unexpected table '+name);
 });
 mocks.admin.mockReturnValue({from,rpc:vi.fn(async()=>({data:[{id:'event',kind,role:'driver',user_id:driver,offer_id:kind==='device_test'?null:offerId,request_id:kind==='device_test'?null:'request',attempts:1,device_id:'device',created_at:new Date(Date.now()-testAge).toISOString()}],error:null}))});
 vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'local-test-access'});
  if(url.startsWith('https://fcm.googleapis.com/')){packets.push(JSON.parse(String(options.body)));return Response.json({name:'synthetic-provider-acceptance'});}
  throw new Error('Unexpected outbound request');
 }));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
const request=()=>new Request('https://example.test/api/internal/push-drain',{headers:{authorization:'Bearer test-worker-secret-with-enough-length'}});
describe('Native push delivery compatibility and eligibility',()=>{
 it('sends a data-only urgent offer to capable APKs, with the server expiry and owner',async()=>{
  const result=await GET(request());expect(result.status).toBe(200);expect(packets).toHaveLength(1);
  expect(packets[0].message).not.toHaveProperty('notification');expect(packets[0].message.android).not.toHaveProperty('notification');
  expect(packets[0].message.data).toMatchObject({alertProtocol:'1',kind:'driver_offer',userId:driver,offerId,pickup:'Test pickup'});
  expect(packets[0].message.android.priority).toBe('HIGH');expect((await result.json()).acceptedByFcm).toBe(1);
 });
 it('retains ordinary system notifications for older installed APKs',async()=>{
  protocol=0;await GET(request());expect(packets).toHaveLength(1);expect(packets[0].message.notification.title).toContain('Ride request');
  expect(packets[0].message.android.notification.channel_id).toBe('nexride_driver_requests_v2');
 });
 it('sends silent closure commands only to capable APKs',async()=>{
  kind='driver_offer_closed';await GET(request());expect(packets).toHaveLength(1);expect(packets[0].message.data.kind).toBe('driver_offer_closed');
  expect(packets[0].message).not.toHaveProperty('notification');expect(packets[0].message.data).not.toHaveProperty('pickup');
  packets=[];protocol=0;await GET(request());expect(packets).toHaveLength(0);
 });
 it('does not send expired or offline-driver offers',async()=>{
  expired=true;await GET(request());expect(packets).toHaveLength(0);
  expired=false;online=false;await GET(request());expect(packets).toHaveLength(0);
 });
 it('rejects untrusted callers before accessing the database or provider',async()=>{
  expect((await GET(new Request('https://example.test'))).status).toBe(401);expect(mocks.admin).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('sends a fixed-copy device test to its single target on legacy and current APKs',async()=>{
  kind='device_test';online=false;
  for(const version of [0,1]){
   protocol=version;packets=[];await GET(request());expect(packets).toHaveLength(1);
   const message=packets[0].message;
   expect(message.notification.title).toBe('BILOO notification test');
   expect(message.data).toMatchObject({kind:'device_test',url:'/driver/profile/settings'});
   expect(message.data).not.toHaveProperty('offerId');expect(message.data).not.toHaveProperty('pickup');
   expect(message.android).toMatchObject({priority:'HIGH',ttl:'30s',collapse_key:'biloo_notification_test'});
   expect(message.android.notification.tag).toBe('biloo_notification_test');
   const from=mocks.admin.mock.results[0].value.from;
   expect(from).not.toHaveBeenCalledWith('ride_requests');expect(from).not.toHaveBeenCalledWith('ride_request_offers');
   const deviceQuery=from.mock.results[from.mock.calls.findIndex(([table]:[string])=>table==='nexride_push_devices')].value;
   expect(deviceQuery.eq).toHaveBeenCalledWith('id','device');
   expect(deviceQuery.eq).toHaveBeenCalledWith('user_id',driver);
  }
 });
 it('never sends stale device tests or extends their expiry',async()=>{
  kind='device_test';testAge=65000;await GET(request());expect(packets).toHaveLength(0);
  testAge=57000;await GET(request());expect(packets).toHaveLength(1);
  expect(Number.parseInt(packets[0].message.android.ttl)).toBeLessThanOrEqual(3);
 });
});

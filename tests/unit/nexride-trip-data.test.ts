import { describe, it, expect } from 'vitest';
import { geography, normalizeTrip, mergeTrip } from '../../lib/nexride-trip-data';
const now = Date.now();
const trip = { id:'t1', driver_id:'driver1', state:'accepted', requested_at:new Date(now-60000).toISOString(), total_minor:14500, currency:'ETB', pickup_address:'Pickup', destination_address:'Airport', pickup:'SRID=4326;POINT(38.76 9.01)' };
const fix = { actor_id:'driver1', location:{type:'Point',coordinates:[38.77,9.02]}, recorded_at:new Date(now).toISOString() };
describe('rider trip presentation boundary',()=>{
 it('decodes real WGS84 coordinates and rejects malformed/projected positions',()=>{
  expect(geography(trip.pickup)).toEqual({lng:38.76,lat:9.01});
  expect(geography({type:'Point',coordinates:[38.77,9.02]})).toEqual({lng:38.77,lat:9.02});
  const bytes=new Uint8Array(25),view=new DataView(bytes.buffer);view.setUint8(0,1);view.setUint32(1,0x20000001,true);view.setUint32(5,4326,true);view.setFloat64(9,38.76,true);view.setFloat64(17,9.01,true);
  const hex=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');expect(geography(hex)).toEqual({lng:38.76,lat:9.01});
  view.setUint32(5,3857,true);expect(geography(Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(''))).toBeUndefined();
  expect(geography('POINT(190 95)')).toBeUndefined();expect(geography('bad')).toBeUndefined();
 });
 it('does not infer arrival, ETA, verification or payment from proximity/completion',()=>{
  const next=normalizeTrip(trip,{location:fix,driver:{review_status:'approved'}},1);
  expect(next.status).toBe('approaching');expect(next.tracking?.etaMinutes).toBeUndefined();expect(next.metrics).toBeUndefined();expect(next.driver?.verification).toBeUndefined();expect(next.payment.status).toBe('unknown');
  const ended=normalizeTrip({...trip,state:'completed'},{payment:{status:'failed'},location:fix},2);
  expect(ended.tracking).toBeNull();expect(ended.payment.status).toBe('failed');expect(ended.finalAmount?.amount).toBe(145);
 });
 it('rejects another driver and predating/future fixes, and clears reassignment data',()=>{
  expect(normalizeTrip(trip,{location:{...fix,actor_id:'old-driver'}},1).tracking).toBeNull();
  expect(normalizeTrip(trip,{location:{...fix,recorded_at:new Date(now-120000).toISOString()}},1).tracking).toBeNull();
  expect(normalizeTrip(trip,{location:{...fix,recorded_at:new Date(now+60000).toISOString()}},1).tracking).toBeNull();
  const unassigned=normalizeTrip({...trip,driver_id:null,state:'requested'},{location:fix},2);expect(unassigned.driver).toBeNull();expect(unassigned.tracking).toBeNull();
 });
 it('preserves a last known fix, rejects old revisions and terminal resurrection',()=>{
  const current=normalizeTrip(trip,{location:fix},2),older=normalizeTrip(trip,{location:{...fix,recorded_at:new Date(now-1000).toISOString()}},3);
  expect(mergeTrip(current,older).tracking?.updatedAt).toBe(current.tracking?.updatedAt);
  expect(mergeTrip(current,{...older,revision:1})).toBe(current);
  const end={...current,status:'cancelled' as const,tracking:null};expect(mergeTrip(end,{...current,revision:4})).toBe(end);
 });
});

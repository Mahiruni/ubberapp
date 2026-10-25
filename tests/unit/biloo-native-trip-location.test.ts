import { describe, expect, it, vi } from 'vitest';
import { publishNativeTripLocation } from '../../lib/biloo-native-trip-location';
import type { RequestSupabase } from '../../lib/nexride-server-supabase';

function fixture(trip: {id:string} | null = {id:'verified-trip'}, queryError: unknown = null, writeError: unknown = null) {
  const upsert=vi.fn().mockResolvedValue({error:writeError});
  const query={ select:vi.fn(),eq:vi.fn(),in:vi.fn(),order:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn().mockResolvedValue({data:trip,error:queryError}) };
  for(const method of ['select','eq','in','order','limit'] as const)query[method].mockReturnValue(query);
  const from=vi.fn((name:string)=>name==='ride_requests'?query:{upsert});
  const authorized={client:{from},user:{id:'authenticated-driver'}} as unknown as RequestSupabase;
  return {authorized,upsert,query,from};
}
describe('Native locked-screen trip location publishing',()=>{
  const fix={latitude:9.008,longitude:38.775,accuracy:12,driver_id:'untrusted-driver',ride_request_id:'untrusted-trip'};
  it('selects the authenticated driver’s active trip and keeps IDs/timestamps server-owned',async()=>{
    const f=fixture(); expect(await publishNativeTripLocation(f.authorized,fix,180)).toBe(true);
    expect(f.query.eq).toHaveBeenCalledWith('assigned_driver_id','authenticated-driver');
    expect(f.query.in).toHaveBeenCalledWith('status',['accepted','arrived_pickup','in_trip']);
    expect(f.upsert).toHaveBeenCalledWith({ride_request_id:'verified-trip',driver_id:'authenticated-driver',latitude:9.008,longitude:38.775,accuracy_meters:12,heading_degrees:180},{onConflict:'ride_request_id'});
    expect(f.upsert.mock.calls[0][0]).not.toHaveProperty('recorded_at');
  });
  it('does not write a trip location while waiting for a ride',async()=>{
    const f=fixture(null); expect(await publishNativeTripLocation(f.authorized,fix,null)).toBe(true); expect(f.upsert).not.toHaveBeenCalled();
  });
  it('reports read/write errors as failed updates',async()=>{
    const read=fixture(null,{code:'query_failed'}); expect(await publishNativeTripLocation(read.authorized,fix,null)).toBe(false); expect(read.upsert).not.toHaveBeenCalled();
    const write=fixture({id:'trip'},null,{code:'42501'}); expect(await publishNativeTripLocation(write.authorized,fix,null)).toBe(false);
  });
  it('does not turn an invalid heading into a claimed orientation',async()=>{
    for(const heading of [NaN,Infinity,-1,361,'180']) {
      const f=fixture(); await publishNativeTripLocation(f.authorized,fix,heading); expect(f.upsert.mock.calls[0][0].heading_degrees).toBeNull();
    }
  });
});

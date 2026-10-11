import { describe, expect, it } from "vitest";
import {
  DRIVER_OFFLINE_MAX_AGE_MS, RIDER_OFFLINE_MAX_AGE_MS,
  storeDriverTrip, readDriverTrip, clearDriverTrip,
  storeRiderTrips, readRiderTrips, purgeOfflineTripContext,
  type RememberedDriverTrip,
} from "../../lib/nexride-offline-recovery";
const driver="4c0d7811-8d24-412f-9131-976aba307ace", other="44a91110-afc6-4af0-9423-e0502bdd72a2";
const offer="86136d6f-f3ab-43d8-a407-1341758dc361";
const request="4b7d0cd1-6de1-4a5d-bb42-3f8c5b62ae22";
const data: RememberedDriverTrip = {
  offerId: offer, requestId: request, status:"accepted",
  rideCategory:"Economy", pickup:"Bole", destination:"Mexico",
  pickupCoordinate:{ lat:9.01,lng:38.76 }, destinationCoordinate:{lat:8.98,lng:38.74},
  pickupDistanceKm:1, pickupEtaMinutes:3, tripDistanceKm:5, tripDurationMinutes:18,
};
function memoryStore() {
  const map = new Map<string,string>();
  return {
    getItem:(key:string)=>map.get(key)||null,
    setItem:(key:string,value:string)=>{map.set(key,value);},
    removeItem:(key:string)=>{map.delete(key);},
    get length(){return map.size;},
    key:(i:number)=>[...map.keys()][i]??null,
    map,
  };
}
describe("NexRide Phase 2 offline recovery",()=>{
  const now=1_790_000_000_000;
  it("restores only this Driver's recent, active trip context",()=>{
    const s=memoryStore();
    expect(storeDriverTrip(s,driver,data,now)).toBe(true);
    expect(readDriverTrip(s,driver,offer,now+1000)).toEqual(data);
    expect(readDriverTrip(s,other,offer,now+1000)).toBeNull();
    expect(readDriverTrip(s,driver,offer,now+DRIVER_OFFLINE_MAX_AGE_MS+1)).toBeNull();
  });
  it("will not restore a completed or invalid trip as actionable",()=>{
    const s=memoryStore();
    expect(storeDriverTrip(s,driver,{...data,status:"completed" as "accepted"},now)).toBe(false);
    expect(storeDriverTrip(s,driver,{...data,offerId:"../../auth"},now)).toBe(false);
    expect(readDriverTrip(s,driver,offer,now)).toBeNull();
  });
  it("does not persist phone numbers or extra Rider data",()=>{
    const s=memoryStore();
    storeDriverTrip(s,driver,{...data,riderPhone:"+251911000000"} as RememberedDriverTrip,now);
    expect([...s.map.values()].join("")).not.toContain("251911000000");
  });
  it("keeps Rider history scoped by identity, sanitized and time-limited",()=>{
    const s=memoryStore();
    storeRiderTrips(s,driver,[{id:request,state:"in_trip",pickup_address:"Bole",destination_address:"Mexico",service_type:"Economy",total_minor:45000,secret:"not stored"}],now);
    expect(readRiderTrips(s,driver,now+500)).toHaveLength(1);
    expect(readRiderTrips(s,other,now+500)).toEqual([]);
    expect([...s.map.values()].join("")).not.toContain("not stored");
    expect(readRiderTrips(s,driver,now+RIDER_OFFLINE_MAX_AGE_MS+1)).toEqual([]);
  });
  it("cleans Driver context on stage completion and every saved trip on logout",()=>{
    const s=memoryStore();
    storeDriverTrip(s,driver,data,now);
    clearDriverTrip(s,driver,offer);
    expect(readDriverTrip(s,driver,offer,now)).toBeNull();
    storeDriverTrip(s,driver,data,now);
    s.setItem("nexride.trip.cache."+request,"legacy personal data");
    s.setItem("sb-nexride-auth-token","keep");
    purgeOfflineTripContext(s);
    expect([...s.map.keys()]).toEqual(["sb-nexride-auth-token"]);
  });
});
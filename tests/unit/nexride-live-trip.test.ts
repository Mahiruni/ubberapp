import { describe,it,expect } from "vitest";
import { validateNexRideLiveTrip,freshNexRideEta } from "../../lib/nexride-live-trip";
const id="01234567-89ab-4cde-a012-3456789abcde";
describe("Android Live Updates — authoritative trip eligibility",()=>{
  it("allows only active, role-specific journey stages",()=>{
    expect(validateNexRideLiveTrip({role:"driver",tripId:id,stage:"accepted"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"driver",tripId:id,stage:"arrived_pickup"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"driver",tripId:id,stage:"in_trip"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"approaching"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"arrived"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"in_trip"})).toBe(true);
    expect(validateNexRideLiveTrip({role:"driver",tripId:id,stage:"approaching"})).toBe(false);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"accepted"})).toBe(false);
  });
  it("refuses unverified IDs and invented ETA",()=>{
    expect(validateNexRideLiveTrip({role:"rider",tripId:"demo",stage:"in_trip"})).toBe(false);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"approaching",etaMinutes:-1})).toBe(false);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"approaching",etaMinutes:400})).toBe(false);
    expect(validateNexRideLiveTrip({role:"rider",tripId:id,stage:"approaching",etaMinutes:5})).toBe(true);
  });
  it("rejects stale/future ETA and accepts fresh server-tracking ETA",()=>{
    const now=Date.parse("2026-10-11T20:00:00Z");
    expect(freshNexRideEta(7,now-30000,now)).toBe(7);
    expect(freshNexRideEta(7,now-120000,now)).toBeUndefined();
    expect(freshNexRideEta(7,now+30000,now)).toBeUndefined();
    expect(freshNexRideEta(0,now,now)).toBeUndefined();
    expect(freshNexRideEta(undefined,now,now)).toBeUndefined();
  });
});
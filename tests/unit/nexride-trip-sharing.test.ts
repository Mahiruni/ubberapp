import { describe,it,expect } from "vitest";
import {
 newTripShareCapability,hashTripShareToken,tripShareToken,tripShareUuid,
 allowedTripShare,activeTripStatuses,tripShareDurationMinutes,
 tripShareLocation,safeTripShareText,
} from "../../lib/nexride-trip-sharing";
const rider="f47e716f-ac18-4f40-bc35-874ec14cdba9";
const driver="1f39fa67-7fb8-4912-bd39-819866331023";
const trip={rider_id:rider,assigned_driver_id:driver,status:"in_trip"};
describe("NexRide secure native trip sharing",()=>{
 it("issues strong opaque capabilities while retaining only verifiable hash",()=>{
  const first=newTripShareCapability(),other=newTripShareCapability();
  expect(tripShareToken.test(first.token)).toBe(true);
  expect(first.token).not.toEqual(other.token);
  expect(first.hash).toBe(hashTripShareToken(first.token));
  expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(first.hash).not.toContain(first.token);
 });
 it("limits link issuance to actual Rider or assigned Driver on a live ride",()=>{
  expect(allowedTripShare(rider,"rider",trip)).toBe(true);
  expect(allowedTripShare(driver,"driver",trip)).toBe(true);
  expect(allowedTripShare(driver,"rider",trip)).toBe(false);
  expect(allowedTripShare(rider,"driver",trip)).toBe(false);
  expect(allowedTripShare(rider,"rider",{...trip,status:"cancelled"})).toBe(false);
  expect(allowedTripShare(driver,"driver",{...trip,status:"completed"})).toBe(false);
  expect(activeTripStatuses.has("pending")).toBe(false);
  expect(tripShareUuid.test(rider)).toBe(true);
  expect(tripShareUuid.test("../rider")).toBe(false);
 });
 it("never extends link expiry beyond the allowed window",()=>{
  expect(tripShareDurationMinutes(15)).toBe(15);
  expect(tripShareDurationMinutes(30)).toBe(30);
  expect(tripShareDurationMinutes(60)).toBe(60);
  expect(tripShareDurationMinutes(100000)).toBe(60);
  expect(tripShareDurationMinutes("15")).toBe(60);
 });
 it("does not disclose stale, future, inaccurate, or malformed GPS",()=>{
  const now=Date.parse("2026-10-11T20:00:00Z");
  const base={latitude:9.00412345,longitude:38.76342701,
    accuracy_meters:12,recorded_at:new Date(now-3000).toISOString()};
  expect(tripShareLocation(base,now)).toEqual({
    lat:9.00412,lng:38.76343,accuracyMeters:12,updatedAt:base.recorded_at,
  });
  expect(tripShareLocation({...base,recorded_at:new Date(now-47000).toISOString()},now)).toBeNull();
  expect(tripShareLocation({...base,recorded_at:new Date(now+7000).toISOString()},now)).toBeNull();
  expect(tripShareLocation({...base,accuracy_meters:500},now)).toBeNull();
  expect(tripShareLocation({...base,latitude:130},now)).toBeNull();
 });
 it("sanitizes public text and never returns raw markup",()=>{
  expect(safeTripShareText("<script>home</script>")).toBe("scripthome/script");
  expect(safeTripShareText("a".repeat(200),15)).toHaveLength(15);
 });
});
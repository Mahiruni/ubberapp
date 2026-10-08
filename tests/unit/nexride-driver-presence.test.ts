import { describe, expect, it } from "vitest";
import { eligibleDriverOffer, shouldOpenDriverOffer } from "../../lib/nexride-driver-presence";
describe("persistent NexRide driver availability", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  it("only surfaces pending, unexpired offers", () => {
    expect(eligibleDriverOffer({id:"1",status:"pending",expires_at:new Date(now+45000).toISOString()},now)).toBe(true);
    expect(eligibleDriverOffer({id:"1",status:"pending",expires_at:new Date(now-1).toISOString()},now)).toBe(false);
    expect(eligibleDriverOffer({id:"1",status:"declined",expires_at:null},now)).toBe(false);
    expect(eligibleDriverOffer({id:"",status:"pending",expires_at:null},now)).toBe(false);
  });
  it("does not interrupt navigation or open a hidden-screen route", () => {
    expect(shouldOpenDriverOffer("/driver/home","visible")).toBe(true);
    expect(shouldOpenDriverOffer("/driver/earnings","visible")).toBe(true);
    expect(shouldOpenDriverOffer("/driver/home","hidden")).toBe(false);
    expect(shouldOpenDriverOffer("/driver/request","visible")).toBe(false);
    expect(shouldOpenDriverOffer("/driver/navigation","visible")).toBe(false);
    expect(shouldOpenDriverOffer("/driver/pickup","visible")).toBe(false);
  });
});

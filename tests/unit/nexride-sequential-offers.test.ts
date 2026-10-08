import { describe, expect, it } from "vitest";
import { confirmedDriverOfferDecision } from "../../lib/nexride-sequential-offers";
describe("Sequential NexRide offers", () => {
  const id = "booking-123";
  it("confirms only the requested action for the correct original booking", () => {
    expect(confirmedDriverOfferDecision("accept",{status:"accepted",requestId:id},id)).toBe(true);
    expect(confirmedDriverOfferDecision("decline",{status:"declined",requestId:id},id)).toBe(true);
    expect(confirmedDriverOfferDecision("pass",{status:"passed",requestId:id},id)).toBe(true);
  });
  it("rejects stale, cross-booking or conflicting responses", () => {
    expect(confirmedDriverOfferDecision("accept",{status:"declined",requestId:id},id)).toBe(false);
    expect(confirmedDriverOfferDecision("accept",{status:"accepted",requestId:"other"},id)).toBe(false);
    expect(confirmedDriverOfferDecision("pass",{status:"expired",requestId:id},id)).toBe(false);
    expect(confirmedDriverOfferDecision("decline",null,id)).toBe(false);
  });
  it("never considers an unexpired offer timed out", () => {
    expect(confirmedDriverOfferDecision("expire",{status:"not_expired"},id)).toBe(false);
    expect(confirmedDriverOfferDecision("expire",{status:"expired"},id)).toBe(true);
  });
});

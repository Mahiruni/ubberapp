import { describe, expect, it } from "vitest";
import { resolveDriverPassOutcome } from "../../lib/nexride-driver-pass";

describe("NexRide driver pass-to-another-driver outcome", () => {
  const id = "sample-booking-id";
  it("shows success only for a new server-confirmed offer", () => {
    expect(resolveDriverPassOutcome({ status:"passed",requestId:id,forwarded:true,anotherOfferActive:true },id)).toBe("forwarded");
  });
  it("distinguishes already-active alternate offers", () => {
    expect(resolveDriverPassOutcome({status:"passed",requestId:id,forwarded:false,anotherOfferActive:true},id)).toBe("other_pending");
  });
  it("does not claim a different driver was notified when none is available", () => {
    expect(resolveDriverPassOutcome({status:"passed",requestId:id,forwarded:false,anotherOfferActive:false},id)).toBe("no_drivers");
  });
  it("rejects stale, unrelated, expired and unauthenticated responses", () => {
    expect(resolveDriverPassOutcome({status:"passed",requestId:"wrong",forwarded:true},id)).toBe(null);
    expect(resolveDriverPassOutcome({status:"expired",requestId:id,forwarded:true},id)).toBe(null);
    expect(resolveDriverPassOutcome({status:"unavailable",requestId:id},id)).toBe(null);
    expect(resolveDriverPassOutcome(null,id)).toBe(null);
  });
});

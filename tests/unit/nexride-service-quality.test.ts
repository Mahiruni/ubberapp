import { describe, expect, it } from "vitest";
import { summarizeServiceQuality, type QualityTrip } from "../../lib/nexride-service-quality";
const trip = (patch: Partial<QualityTrip>): QualityTrip => ({ status: "pending", created_at: "2026-10-16T08:00:00Z", accepted_at: null, rider_id: null, cancelled_by: null, ...patch });
describe("service quality baseline", () => {
  it("keeps empty timings and rates unknown instead of showing perfect service", () => {
    expect(summarizeServiceQuality([])).toMatchObject({ observedRequests: 0, closedCompletionPercent: null, meanMatchSeconds: null, repeatCompletedRiders: 0 });
  });
  it("excludes active requests from closed completion and counts repeats only for completed rides", () => {
    const data = summarizeServiceQuality([
      trip({ status: "completed", rider_id: "one", accepted_at: "2026-10-16T08:01:00Z" }),
      trip({ status: "completed", rider_id: "one", accepted_at: "2026-10-16T08:03:00Z" }),
      trip({ status: "cancelled", rider_id: "two", cancelled_by: "rider" }),
      trip({ status: "cancelled", cancelled_by: "driver" }),
      trip({ status: "cancelled", cancelled_by: "system" }),
      trip({ status: "withdrawn", rider_id: "two" }), trip({ status: "pending" }), trip({ status: "in_trip" }),
    ]);
    expect(data).toMatchObject({ observedRequests: 8, closedCompletionPercent: 33.3, meanMatchSeconds: 120, matchedSamples: 2, repeatCompletedRiders: 1, completedRiders: 1, riderCancellations: 1, driverCancellations: 1, unattributedCancellations: 1 });
    expect(JSON.stringify(data)).not.toContain('"one"');
  });
  it("ignores invalid and negative acceptance intervals while keeping a genuine zero interval", () => {
    const data = summarizeServiceQuality([
      trip({ accepted_at: "invalid" }), trip({ accepted_at: "2026-10-16T07:59:00Z" }), trip({ accepted_at: "2026-10-16T08:00:00Z" }),
    ]);
    expect(data.matchedSamples).toBe(1); expect(data.meanMatchSeconds).toBe(0);
  });
});

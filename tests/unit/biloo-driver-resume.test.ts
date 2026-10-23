import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";

const { from, role } = vi.hoisted(() => ({ from: vi.fn(), role: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { from } }));
vi.mock("../../lib/nexride-account-role", () => ({ resolveSessionRole: role }));
import { driverResumeDestination } from "../../lib/nexride-driver-verification";

const session = { user: { id: "driver-id", user_metadata: {
  role: "admin", driver_onboarding_complete: true,
} } } as unknown as Session;
function backend(status: string | null, failure = false) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => query),
    retry: vi.fn().mockResolvedValue({ data: status ? {
      review_status: status, vehicle: "Toyota Yaris", vehicle_color: "white", vehicle_plate: "AA1234",
    } : null, error: failure ? new Error("offline") : null }),
  };
  from.mockReturnValue(query);
}
beforeEach(() => { vi.clearAllMocks(); role.mockResolvedValue("driver"); });
describe("database-owned Driver resume", () => {
  it.each(["pending", "rejected", "suspended", "unknown"])("keeps %s Drivers out of the dashboard despite forged completion metadata", async status => {
    backend(status);
    expect(await driverResumeDestination(session)).toBe("/driver/verification");
  });
  it("opens an approved Driver directly even with stale incomplete Auth metadata", async () => {
    backend("approved");
    expect(await driverResumeDestination({ ...session, user: { ...session.user, user_metadata: {} } })).toBe("/driver/home");
  });
  it("resumes incomplete documents after vehicle signup", async () => {
    backend("draft");
    expect(await driverResumeDestination(session)).toBe("/driver/verification");
  });
  it("starts a missing Driver application without creating another identity", async () => {
    backend(null);
    expect(await driverResumeDestination(session)).toBe("/driver/onboarding");
  });
  it("does not turn a failed review lookup into approval", async () => {
    backend("approved", true);
    await expect(driverResumeDestination(session)).rejects.toThrow("offline");
  });
  it("uses the authoritative role for existing Rider and Admin accounts", async () => {
    role.mockResolvedValue("rider");
    expect(await driverResumeDestination(session)).toBe("/driver/onboarding");
    role.mockResolvedValue("admin");
    expect(await driverResumeDestination(session)).toBe("/admin");
    expect(from).not.toHaveBeenCalled();
  });
  it("offers recovery when the review request never settles", async () => {
    vi.useFakeTimers();
    const query = { select: () => query, eq: () => query, maybeSingle: () => query, retry: () => new Promise(() => {}) };
    from.mockReturnValue(query);
    const check = expect(driverResumeDestination(session)).rejects.toThrow("operation_timeout");
    await vi.advanceTimersByTimeAsync(15_000);
    await check;
    vi.useRealTimers();
  });
});

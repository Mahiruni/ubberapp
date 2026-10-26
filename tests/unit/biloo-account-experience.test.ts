import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDriverProfileData, verificationSummary, type DriverProfileData } from "../../lib/nexride-driver-profile";

const database = vi.hoisted(() => ({ from: vi.fn(), getSession: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { from: database.from, auth: { getSession: database.getSession } } }));

const source = (path: string) => readFileSync(join(process.cwd(),path),"utf8");

const driver = (partial: Partial<DriverProfileData> = {}): DriverProfileData => ({
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Test Driver", phone: "", email: "", avatarUrl: "",
  role: "driver", accountStatus: "active", rating: null, completedTrips: null,
  vehicle: "", vehicleColor: "", vehiclePlate: "",
  licenseNumber: "", licenseExpiry: "", licenseDocumentPath: "",
  vehicleRegistrationPath: "", reviewStatus: "draft", rejectionReason: "",
  submittedAt: "", reviewedAt: "", ...partial
});

describe("Biloo premium Account experience", () => {
  it("uses genuinely authorized navigation and the live account backends", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    const driverSettings = source("app/driver/profile/settings/page.tsx");
    expect(rider).toContain("readAccount()");
    expect(rider).toContain("saveAccount(account,form)");
    expect(rider).toContain("signOutNexRide('rider')");
    expect(driverScreen).toContain("loadDriverProfileData(driverId)");
    expect(driverScreen).toContain('router.push("/driver/profile/payouts")');
    expect(driverScreen).toContain('router.push("/driver/profile/documents")');
    expect(driverScreen).toContain('router.push("/account/manage?role=driver#account-security")');
    expect(driverScreen).toContain('signOutNexRide("driver")');
    expect(driverSettings).toContain("supabase.auth.getUser()");
    expect(driverSettings).toContain("identity.data.user?.id !== profile.id");
    expect(driverSettings).toContain('router.push("/driver/profile")');
  });

  it("does not fabricate wallet balances, rides or verification statuses", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    expect(rider).not.toMatch(/fakeBalance|sampleRides|mockRating/);
    expect(driverScreen).toContain('profile.rating === null ? "—"');
    expect(driverScreen).toContain('profile.completedTrips === null ? "—"');
    expect(driverScreen).toContain("verificationSummary(profile)");
  });

  it("keeps account management unique while leaving journey records in their own destinations", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    const registry = source("lib/biloo-navigation-registry.ts");
    expect(rider).toContain("saveAccount(account,form)");
    expect(rider).toContain("title={say('Account & security'");
    expect(rider).not.toContain('className="biloo-rider-account-overview"');
    expect(rider).not.toContain("onClick={props.rides}");
    expect(rider).not.toContain("onClick={props.saved}");
    expect(rider).not.toContain("onClick={props.payments}");
    expect(driverScreen).toContain('router.push("/driver/profile/payouts")');
    expect(driverScreen).not.toContain('title={say("Trip activity")}');
    expect(driverScreen).not.toContain('title={say("Earnings report")}');
    expect(registry).toContain('id:"trips"');
    expect(registry).toContain('id:"earnings"');
  });

  it("removes expired-license verified status without altering database approvals", () => {
    const expired = driver({reviewStatus:"approved", licenseDocumentPath:"private/license.pdf", licenseExpiry:"2020-01-01"});
    const result = verificationSummary(expired);
    expect(result.tone).not.toBe("approved");
    expect(result.title).toMatch(/expired/i);
    const valid = driver({reviewStatus:"approved", licenseDocumentPath:"private/license.pdf", licenseExpiry:"2099-01-01"});
    expect(verificationSummary(valid).tone).toBe("approved");
    const pending = driver({reviewStatus:"pending"});
    expect(verificationSummary(pending).title).toMatch(/review/i);
    const vehicle = source("app/driver/profile/vehicle/page.tsx");
    const payouts = source("app/driver/profile/payouts/page.tsx");
    expect(vehicle).toContain('documentStatus(profile, "license") === "Expired"');
    expect(vehicle).toContain('licenseExpired ? say("Expired")');
    expect(payouts).toContain('verificationSummary(profile).tone !== "approved"');
  });

});

type Result = { data?: Record<string, unknown> | null; error?: Error | null; count?: number | null };
function backend(overrides: Record<string, Result> = {}) {
  database.getSession.mockResolvedValue({ data: { session: { user: { email: "driver@example.test", user_metadata: {
    full_name: "Editable name", role: "admin", account_status: "active", review_status: "approved",
  } } } } });
  const results: Record<string, Result> = {
    profiles: { data: { role: "driver", account_status: "active", full_name: "Recorded name" } },
    drivers: { data: { review_status: "pending", rating: 4.8 } },
    ride_requests: { data: null, count: 12, error: null },
    ...overrides,
  };
  const queries: Record<string, { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }> = {};
  database.from.mockImplementation((table: string) => {
    const result = Promise.resolve(results[table]);
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => result), then: result.then.bind(result) };
    queries[table] = query;
    return query;
  });
  return queries;
}

describe("Driver account data boundaries", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the authenticated driver's records and never trusts editable metadata for approval", async () => {
    const queries = backend();
    const profile = await loadDriverProfileData("driver-id");
    expect(profile).toMatchObject({ fullName: "Recorded name", role: "driver", accountStatus: "active", reviewStatus: "pending", rating: 4.8, completedTrips: 12 });
    expect(queries.profiles.eq).toHaveBeenCalledWith("id", "driver-id");
    expect(queries.drivers.eq).toHaveBeenCalledWith("id", "driver-id");
    expect(queries.ride_requests.eq).toHaveBeenCalledWith("assigned_driver_id", "driver-id");
    expect(queries.ride_requests.eq).toHaveBeenCalledWith("status", "completed");

    backend({ profiles: { data: null }, drivers: { data: null } });
    const missing = await loadDriverProfileData("driver-id");
    expect(missing).toMatchObject({ role: "", accountStatus: "unknown", reviewStatus: "draft", rating: null });
    expect(verificationSummary(missing)).toMatchObject({ tone: "restricted", title: "Account status unavailable" });
  });

  it.each([
    ["missing exact count", { count: null }, null],
    ["unavailable count", { error: new Error("Unavailable"), count: 12 }, null],
    ["verified zero", { count: 0 }, 0],
  ])("preserves unknown metrics separately from a %s", async (_label, result, expected) => {
    backend({ ride_requests: result as Result });
    expect((await loadDriverProfileData("driver-id")).completedTrips).toBe(expected);
  });

  it.each(["profiles", "drivers"])("surfaces %s errors instead of inventing a profile", async table => {
    const error = new Error("Profile temporarily unavailable");
    backend({ [table]: { error, data: null } });
    await expect(loadDriverProfileData("driver-id")).rejects.toBe(error);
  });
});

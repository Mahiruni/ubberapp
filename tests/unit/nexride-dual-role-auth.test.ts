import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRiderEligibility } from "../../lib/nexride-rider-eligibility";

type Row = { data: Record<string, unknown> | null; error: { code: string } | null };
const record = (data: Record<string, unknown> | null): Row => ({ data, error: null });
function fakeAdmin(rows: Record<string, Row>): SupabaseClient {
  return {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        limit: () => query,
        maybeSingle: async () => rows[table] ?? record(null),
      };
      return query;
    },
  } as unknown as SupabaseClient;
}
const base: Record<string, Row> = {
  profiles: record({ role: "driver", account_status: "active" }),
  account_roles: record({ role: "rider" }),
  account_role_onboarding: record({ status: "completed" }),
  drivers: record({ is_online: false }),
  ride_requests: record(null),
};

describe("NexRide unified Rider and Driver account", () => {
  it("accepts an offline Driver with completed Rider onboarding", async () => {
    expect(await resolveRiderEligibility(fakeAdmin(base), "same-account-id")).toBe("eligible");
  });
  it("rejects a Driver who is Online", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, drivers: record({ is_online: true }) }), "same-account-id")).toBe("driver_offline_required");
  });
  it("rejects a Driver serving an active trip", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, ride_requests: record({ id: "active-trip" }) }), "same-account-id")).toBe("driver_offline_required");
  });
  it("requires a server-approved Rider membership", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, account_roles: record(null) }), "same-account-id")).toBe("rider_account_required");
  });
  it("requires completed Rider onboarding", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, account_role_onboarding: record({ status: "incomplete" }) }), "same-account-id")).toBe("rider_profile_incomplete");
  });
  it("rejects suspended Rider roles", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, account_role_onboarding: record({ status: "suspended" }) }), "same-account-id")).toBe("account_inactive");
  });
  it("rejects an inactive primary account", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, profiles: record({ role: "driver", account_status: "suspended" }) }), "same-account-id")).toBe("account_inactive");
  });
  it("fails closed if Rider membership lookup fails", async () => {
    expect(await resolveRiderEligibility(fakeAdmin({ ...base, account_roles: { data: null, error: { code: "PGRST" } } }), "same-account-id")).toBe("temporarily_unavailable");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authorized, admin } = vi.hoisted(() => ({
  authorized: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("../../lib/nexride-server-supabase", () => ({
  authorizedRequestSupabase: authorized,
}));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: admin,
}));

import { POST } from "../../app/api/rider/fares/route";
import { validFareSet } from "../../lib/nexride-booking";

const ride = {
  pickup: { lat: 9.008, lng: 38.775 },
  destination: { lat: 8.978, lng: 38.799 },
};
const request = (token?: string) =>
  new Request("http://localhost/api/rider/fares", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(ride),
  });

const withProfile = (
  role: string,
  account_status = "active",
  riderRole = role === "rider",
  onboarding = riderRole ? "completed" : "incomplete",
  online = false,
  activeDriverTrip = false,
) => {
  authorized.mockResolvedValue({ user: { id: "test-user" } });
  const rows: Record<string, unknown> = {
    profiles: { role, account_status },
    account_roles: riderRole ? { role: "rider" } : null,
    account_role_onboarding: riderRole ? { role: "rider", status: onboarding } : null,
    drivers: { is_online: online },
    ride_requests: activeDriverTrip ? { id: "existing-trip" } : null,
  };
  admin.mockReturnValue({
    from: vi.fn((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return query;
    }),
  });
};

beforeEach(() => {
  authorized.mockReset();
  admin.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("production ride fare authorization", () => {
  it("keeps guests on explicitly non-bookable sample fares", async () => {
    const response = await POST(request());
    const fare = await response.json();
    expect(response.status).toBe(200);
    expect(validFareSet(fare)).toBe(true);
    expect(fare.source).toBe("preview");
    expect(fare.previewReason).toBe("sign_in_required");
    expect(authorized).not.toHaveBeenCalled();
  });

  it("returns 401 for expired bearer tokens to activate session refresh", async () => {
    authorized.mockResolvedValue(null);
    const response = await POST(request("expired"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: "session_expired" });
  });

  it.each(["rider", "admin"])(
    "gives an active %s account a bookable Economy fare",
    async (role) => {
      withProfile(role);
      const response = await POST(request("valid"));
      const fare = await response.json();
      expect(response.status).toBe(200);
      expect(validFareSet(fare)).toBe(true);
      expect(fare.source).toBe("service");
      expect(fare.offers.find((o: { category: string }) => o.category === "economy")
        ?.availability).toBe("available");
    },
  );

  it("rejects Driver roles instead of silently returning preview fares", async () => {
    withProfile("driver");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "rider_account_required" });
  });

  it("allows a verified Rider membership on an Offline Driver identity", async () => {
    withProfile("driver", "active", true, "completed", false);
    const response = await POST(request("valid"));
    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe("service");
  });

  it("asks for incomplete Rider onboarding instead of another login", async () => {
    withProfile("driver", "active", true, "incomplete");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "rider_profile_incomplete" });
  });

  it("requires Drivers to go Offline and finish active trips", async () => {
    withProfile("driver", "active", true, "completed", true);
    expect((await POST(request("valid"))).status).toBe(403);
    withProfile("driver", "active", true, "completed", false, true);
    const response = await POST(request("valid"));
    expect(await response.json()).toEqual({ status: "driver_offline_required" });
  });

  it("denies Driver identities without a provisioned Rider membership", async () => {
    withProfile("driver", "active", false);
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "rider_account_required" });
  });

  it("keeps suspended Rider accounts unbookable", async () => {
    withProfile("rider", "suspended", true, "completed");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "account_inactive" });
  });

  it("rejects inactive accounts", async () => {
    withProfile("rider", "suspended");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
  });
});

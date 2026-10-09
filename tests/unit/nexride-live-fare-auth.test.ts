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
  riderMembership = false,
  driverOnline = false,
  activeDriverTrip = false,
) => {
  authorized.mockResolvedValue({ user: { id: "test-user" } });
  const tableResult: Record<string, unknown> = {
    profiles: { role, account_status },
    account_roles: riderMembership ? { role: "rider" } : null,
    drivers: { is_online: driverOnline },
    ride_requests: activeDriverTrip ? { id: "active-trip" } : null,
  };
  admin.mockReturnValue({
    from: vi.fn((table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        in: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: tableResult[table] || null, error: null }),
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

  it("rejects Drivers without a Rider membership", async () => {
    withProfile("driver");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "rider_account_required" });
  });

  it("recognizes authorized dual-role Drivers who are offline and free", async () => {
    withProfile("driver", "active", true);
    const response = await POST(request("valid"));
    expect(response.status).toBe(200);
    expect((await response.json()).source).toBe("service");
  });

  it("does not quote bookable rides to dual-role Drivers who are Online or on a trip", async () => {
    withProfile("driver", "active", true, true);
    expect((await POST(request("valid"))).status).toBe(403);
    withProfile("driver", "active", true, false, true);
    expect((await POST(request("valid"))).status).toBe(403);
  });

  it("rejects inactive accounts", async () => {
    withProfile("rider", "suspended");
    const response = await POST(request("valid"));
    expect(response.status).toBe(403);
  });
});

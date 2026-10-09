import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorized, adminClient, eligible } = vi.hoisted(() => ({
  authorized: vi.fn(), adminClient: vi.fn(), eligible: vi.fn(),
}));
vi.mock("../../lib/nexride-server-supabase", () => ({
  authorizedRequestSupabase: authorized,
}));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: adminClient,
}));
vi.mock("../../lib/nexride-rider-eligibility", () => ({
  resolveRiderEligibility: eligible,
  riderEligibilityHttpStatus: () => 403,
}));

import { POST } from "../../app/api/rider/requests/route";
import { liveFareSet } from "../../lib/nexride-live-pricing";

const riderId = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
const requestId = "a9999999-aaaa-4999-9999-aaaaaaaaaaaa";
const pickup = { lat: 9.008, lng: 38.775, name: "Pickup" };
const destination = { lat: 8.978, lng: 38.799, name: "Destination" };
function booking() {
  const fares = liveFareSet({ pickup, destination });
  const economy = fares.offers.find(f => f.category === "economy")!;
  return new Request("http://localhost/api/rider/requests", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "driver-receives-one-offer-per-booking",
    },
    body: JSON.stringify({
      pickup, destination, quoteId: economy.id, category: "economy",
      revision: fares.revision, paymentMethod: "cash",
    }),
  });
}

function mockDatabase(opts: { active?: boolean; dispatchError?: boolean } = {}) {
  const rpc = vi.fn(async () => ({
    data: opts.dispatchError ? null : 1,
    error: opts.dispatchError ? { code: "PGRST202" } : null,
  }));
  const insert = vi.fn();
  const db = {
    rpc,
    from: vi.fn((table: string) => {
      let key = "";
      const query = {
        select: () => query,
        eq: (column: string) => {
          if (column === "client_request_key") key = "idempotency";
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        insert: (value: unknown) => {
          insert({ table, value });
          key = "insert";
          return query;
        },
        maybeSingle: async () => ({
          data: opts.active && key !== "idempotency" && table === "ride_requests"
            ? { id: requestId, status: "pending", dispatch_state: "searching" }
            : null,
          error: null,
        }),
        single: async () => ({ data: { id: requestId }, error: null }),
      };
      return query;
    }),
  };
  adminClient.mockReturnValue(db);
  return { rpc, insert, db };
}

beforeEach(() => {
  authorized.mockReset().mockResolvedValue({ user: { id: riderId } });
  adminClient.mockReset();
  eligible.mockReset().mockResolvedValue("eligible");
});

describe("NexRide server-owned one-driver dispatch", () => {
  it("never bulk-inserts offers and instead invokes trusted sequential dispatch", async () => {
    const db = mockDatabase();
    const response = await POST(booking());
    expect(response.status).toBe(201);
    expect((await response.json()).requestId).toBe(requestId);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0].table).toBe("ride_requests");
    expect(db.rpc).toHaveBeenCalledWith("rider_dispatch_pending_server", {
      p_actor: riderId, p_request_id: requestId,
    });
    expect(db.db.from).not.toHaveBeenCalledWith("ride_request_offers");
  });
  it("preserves the committed booking when immediate dispatch is delayed", async () => {
    const db = mockDatabase({ dispatchError: true });
    const response = await POST(booking());
    expect(response.status).toBe(201);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
  it("reuses the existing active request instead of sending another offer", async () => {
    const db = mockDatabase({ active: true });
    const response = await POST(booking());
    expect(response.status).toBe(200);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("does not dispatch for an ineligible Rider", async () => {
    eligible.mockResolvedValue("rider_profile_incomplete");
    const db = mockDatabase();
    const response = await POST(booking());
    expect(response.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorized, serverAdmin } = vi.hoisted(() => ({
  authorized: vi.fn(),
  serverAdmin: vi.fn(),
}));
vi.mock("../../lib/nexride-server-supabase", () => ({
  authorizedRequestSupabase: authorized,
}));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: serverAdmin,
}));

import { POST } from "../../app/api/rider/requests/route";
import { liveFareSet } from "../../lib/nexride-live-pricing";

const pickup = { lat: 9.008, lng: 38.775, name: "Pickup" };
const destination = { lat: 8.978, lng: 38.799, name: "Destination" };
const accountId = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
const requestId = "a9999999-aaaa-4999-9999-aaaaaaaaaaaa";
const fares = () => liveFareSet({ pickup, destination });
const bookingRequest = () => {
  const set = fares();
  return new Request("http://localhost/api/rider/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": "rider-retry-unique-key-123456" },
    body: JSON.stringify({
      pickup, destination, quoteId: set.offers[0].id,
      category: "economy", revision: set.revision, paymentMethod: "cash",
    }),
  });
};

function stubBackend({ existing = false, active = false, dispatchFails = false } = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: dispatchFails ? null : 0,
    error: dispatchFails ? { code: "PGRST202" } : null,
  });
  const insert = vi.fn();
  const update = vi.fn();

  serverAdmin.mockReturnValue({
    rpc,
    from: (table: string) => {
      let field = "";
      const query = {
        select: (_columns: string) => query,
        eq: (key: string, _value: unknown) => {
          if (key === "client_request_key") field = "idempotency";
          return query;
        },
        in: () => query,
        order: () => query,
        limit: () => query,
        insert: (values: unknown) => { insert(values); field = "insert"; return query; },
        update: (values: unknown) => { update(values); return query; },
        maybeSingle: async () => {
          if (table === "profiles") return { data: { id: accountId, role: "rider", account_status: "active" }, error: null };
          if (field === "idempotency")
            return { data: existing ? { id: requestId, status: "pending" } : null, error: null };
          return { data: active ? { id: requestId, status: "pending", dispatch_state: "searching" } : null, error: null };
        },
        single: async () => ({ data: { id: requestId }, error: null }),
      };
      return query;
    },
  });
  return { rpc, insert, update };
}

beforeEach(() => {
  authorized.mockReset().mockResolvedValue({ user: { id: accountId } });
  serverAdmin.mockReset();
});

describe("Driver comes Online during an existing Rider search", () => {
  it("creates exactly one pending Rider request and delegates sequential dispatch to the database", async () => {
    const db = stubBackend();
    const response = await POST(bookingRequest());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "accepted", requestId });
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0]).toMatchObject({
      rider_id: accountId, status: "pending", dispatch_state: "searching",
    });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith("rider_dispatch_pending_server", {
      p_actor: accountId, p_request_id: requestId,
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("leaves an existing request intact when no Driver is Online yet", async () => {
    const db = stubBackend({ dispatchFails: true });
    const response = await POST(bookingRequest());
    expect(response.status).toBe(201);
    expect((await response.json()).requestId).toBe(requestId);
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("reuses an active pending search instead of placing or dispatching a duplicate", async () => {
    const db = stubBackend({ active: true });
    const response = await POST(bookingRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "accepted", requestId });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

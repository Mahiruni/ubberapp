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
vi.mock('../../lib/location', async importOriginal => ({
  ...await importOriginal<typeof import('../../lib/location')>(),
  routeBetween: vi.fn(async () => ({ provider: 'mapbox', distanceMeters: 5600, durationSeconds: 960 })),
}));

import { POST } from "../../app/api/rider/requests/route";
import { liveFareSet } from "../../lib/nexride-live-pricing";
import { routeBetween } from '../../lib/location';

const riderId = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
const requestId = "a9999999-aaaa-4999-9999-aaaaaaaaaaaa";
const pickup = { lat: 9.008, lng: 38.775, name: "Pickup" };
const destination = { lat: 8.978, lng: 38.799, name: "Destination" };
let quotedFares: Awaited<ReturnType<typeof liveFareSet>>;
function booking() {
  const fares = quotedFares;
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

function mockDatabase(opts: { active?: boolean; existing?: boolean; dispatchError?: boolean; noDrivers?: boolean; cancelled?: boolean } = {}) {
  const rpc = vi.fn(async () => ({
    data: opts.dispatchError ? null : 1,
    error: opts.dispatchError ? { code: "PGRST202" } : null,
  }));
  const insert = vi.fn();
  const update = vi.fn(), filters = vi.fn();
  const db = {
    rpc,
    from: vi.fn((table: string) => {
      let key = "";
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters(column, value);
          if (column === "client_request_key") key = "idempotency";
          return query;
        },
        in: () => query,
        is: (column: string, value: unknown) => { filters(column, value); return query; },
        order: () => query,
        limit: () => query,
        insert: (value: unknown) => {
          insert({ table, value });
          key = "insert";
          return query;
        },
        update: (value: unknown) => { update(value); key = 'update'; return query; },
        maybeSingle: async () => ({
          data: key === 'update' ? (opts.cancelled ? { id: requestId } : null)
            : (opts.active && key !== "idempotency" || opts.existing && key === "idempotency") && table === "ride_requests"
            ? { id: requestId, status: "pending", dispatch_state: opts.noDrivers ? 'no_drivers' : "searching" }
            : null,
          error: null,
        }),
        single: async () => ({ data: { id: requestId }, error: null }),
      };
      return query;
    }),
  };
  adminClient.mockReturnValue(db);
  return { rpc, insert, db, update, filters };
}

beforeEach(async () => {
  authorized.mockReset().mockResolvedValue({ user: { id: riderId } });
  adminClient.mockReset();
  eligible.mockReset().mockResolvedValue("eligible");
  vi.mocked(routeBetween).mockReset().mockResolvedValue({ provider: 'mapbox', distanceMeters: 5600, durationSeconds: 960 });
  // The client obtains a road quote before submitting a booking. Keep that
  // quote independent of the provider failure/dispatch scenario under test.
  quotedFares = await liveFareSet({ pickup, destination });
  vi.mocked(routeBetween).mockClear();
});

describe("NexRide server-owned one-driver dispatch", () => {
  it("never bulk-inserts offers and instead invokes trusted sequential dispatch", async () => {
    const db = mockDatabase();
    const response = await POST(booking());
    expect(response.status).toBe(201);
    expect((await response.json()).requestId).toBe(requestId);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.insert.mock.calls[0][0].table).toBe("ride_requests");
    expect(db.insert.mock.calls[0][0].value).toMatchObject({
      estimated_trip_distance_km: 5.6, estimated_trip_duration_minutes: 16, payment_status: 'pending',
    });
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
  it('does not create a trip when actual Mapbox routing is unavailable', async () => {
    vi.mocked(routeBetween).mockRejectedValue(new Error('provider_unavailable'));
    const db = mockDatabase();
    const response = await POST(booking());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'route_unavailable' });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('resolves the original idempotency key before rejecting an expired quote', async () => {
    const db = mockDatabase({ existing: true });
    const original = booking(), body = await original.json();
    body.revision = 'expired'; body.quoteId = 'expired';
    const response = await POST(new Request(original.url, { method: 'POST', headers: original.headers, body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect((await response.json()).requestId).toBe(requestId);
    expect(routeBetween).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('retains the prior search if routing the replacement fails', async () => {
    vi.mocked(routeBetween).mockRejectedValue(new Error('provider_unavailable'));
    const db = mockDatabase({ active: true, noDrivers: true });
    expect((await POST(booking())).status).toBe(503);
    expect(db.update).not.toHaveBeenCalled(); expect(db.insert).not.toHaveBeenCalled();
  });
  it('resumes the existing ride if a Driver accepts while a replacement is being prepared', async () => {
    const db = mockDatabase({ active: true, noDrivers: true, cancelled: false });
    const response = await POST(booking());
    expect(response.status).toBe(200); expect((await response.json()).requestId).toBe(requestId);
    expect(db.filters).toHaveBeenCalledWith('status', 'pending');
    expect(db.filters).toHaveBeenCalledWith('dispatch_state', 'no_drivers');
    expect(db.filters).toHaveBeenCalledWith('assigned_driver_id', null);
    expect(db.insert).not.toHaveBeenCalled(); expect(db.rpc).not.toHaveBeenCalled();
  });
});

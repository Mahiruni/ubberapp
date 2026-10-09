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
import { PATCH } from "../../app/api/driver/availability/route";

const driverId = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
const driver = {
  is_online: false,
  review_status: "approved",
  rejection_reason: null,
  rating: 4.9,
  vehicle: "Toyota Corolla",
  vehicle_plate: "ET-1234",
};

const request = (online: boolean) => new Request("http://localhost/api/driver/availability", {
  method: "PATCH",
  body: JSON.stringify({
    online,
    location: { latitude: 9.008, longitude: 38.775, accuracy: 5 },
  }),
});

function mockBackend({ wasOnline = false, dispatchFails = false } = {}) {
  const existing = { ...driver, is_online: wasOnline };
  const rpc = vi.fn().mockResolvedValue({
    data: dispatchFails ? null : 1,
    error: dispatchFails ? { code: "PGRST202" } : null,
  });
  const onlineWrites = vi.fn();
  const locationWrites = vi.fn();

  authorized.mockResolvedValue({
    user: { id: driverId, user_metadata: { vehicle_color: "white" } },
    client: {
      from: () => {
        const q = {
          update: (payload: unknown) => { onlineWrites(payload); return q; },
          eq: () => q,
          select: () => q,
          single: async () => ({ data: { ...existing, is_online: true }, error: null }),
        };
        return q;
      },
    },
  });
  serverAdmin.mockReturnValue({
    rpc,
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        update: (payload: unknown) => { locationWrites(payload); return q; },
        single: async () => ({ data: existing, error: null }),
        maybeSingle: async () => ({
          data: table === "profiles" ? { role: "driver", account_status: "active" } : existing,
          error: null,
        }),
      };
      return q;
    },
  });
  return { rpc, onlineWrites, locationWrites };
}

beforeEach(() => { authorized.mockReset(); serverAdmin.mockReset(); });

describe("Driver becomes Online while Rider is searching", () => {
  it("calls server-only waiting dispatch immediately after confirmed Driver Online", async () => {
    const backend = mockBackend();
    const response = await PATCH(request(true));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ready");
    expect(backend.locationWrites).toHaveBeenCalledOnce();
    expect(backend.onlineWrites).toHaveBeenCalledExactlyOnceWith({ is_online: true });
    expect(backend.rpc).toHaveBeenCalledExactlyOnceWith(
      "nexride_dispatch_waiting_for_driver_server",
      { p_driver_id: driverId },
    );
  });

  it("does not reissue Rider offers when refreshing an already Online Driver", async () => {
    const backend = mockBackend({ wasOnline: true });
    expect((await PATCH(request(true))).status).toBe(200);
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("keeps a Driver Online if the immediate dispatch fails; scheduled retry remains active", async () => {
    const backend = mockBackend({ dispatchFails: true });
    const response = await PATCH(request(true));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("ready");
    expect(backend.rpc).toHaveBeenCalledOnce();
  });

  it("does not dispatch Rider requests when the Driver goes Offline", async () => {
    const backend = mockBackend({ wasOnline: true });
    const response = await PATCH(request(false));
    expect(response.status).toBe(200);
    expect(backend.rpc).not.toHaveBeenCalled();
  });
});

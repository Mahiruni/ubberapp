import { beforeEach, describe, expect, it, vi } from "vitest";
const { authorize, rpc } = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/nexride-server-supabase", () => ({ authorizedRequestSupabase: authorize }));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: () => ({ rpc }),
}));
import { POST } from "../../app/api/rider/trips/[tripId]/cancel/route";
const id = "17bd2ff8-45a0-49b0-96ef-32c253137642";
const url = "http://localhost/api/rider/trips/" + id + "/cancel";
const ctx = { params: Promise.resolve({ tripId: id }) };

beforeEach(() => {
  authorize.mockReset(); rpc.mockReset();
  authorize.mockResolvedValue({ user: { id: "e0014d65-4ec9-4ec8-bdca-166a69780807" } });
  rpc.mockResolvedValue({ data: { requestId: id, status: "cancelled", driverNotified: true }, error: null });
});
describe("server-controlled zero-fee rider cancellation", () => {
  it("accepts cancellation confirmed by Supabase using only the verified rider ID", async () => {
    const response = await POST(new Request(url, { method: "POST" }), ctx);
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("cancelled");
    expect(rpc).toHaveBeenCalledWith("rider_cancel_active_trip_server", {
      p_actor: "e0014d65-4ec9-4ec8-bdca-166a69780807", p_request_id: id,
    });
  });
  it("does not allow unauthenticated cancellation", async () => {
    authorize.mockResolvedValue(null);
    expect((await POST(new Request(url,{method:"POST"}),ctx)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a completed-trip race without declaring cancellation", async () => {
    rpc.mockResolvedValue({ data: { status: "conflict", currentStatus: "completed", requestId: id }, error: null });
    const response = await POST(new Request(url,{method:"POST"}),ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).currentStatus).toBe("completed");
  });
  it("does not invent success when database operation fails", async () => {
    rpc.mockResolvedValue({ data:null, error: { code: "XX000", message:"temporary" } });
    expect((await POST(new Request(url,{method:"POST"}),ctx)).status).toBe(503);
  });
});

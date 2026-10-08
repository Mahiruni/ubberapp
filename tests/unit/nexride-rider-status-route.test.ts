import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorize, rpc } = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("../../lib/nexride-server-supabase", () => ({ authorizedRequestSupabase: authorize }));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: () => ({ rpc }),
}));
import { GET, POST } from "../../app/api/rider/requests/[requestId]/route";
import { validMatch } from "../../lib/nexride-matching";

const id = "17bd2ff8-45a0-49b0-96ef-32c253137642";
const url = "http://localhost/api/rider/requests/" + id;
const ctx = { params: Promise.resolve({ requestId: id }) };
const snapshot = {
  requestId: id, version: 1, status: "searching",
  cancellation: { allowed: true, requiresConfirmation: false, fee: 0 },
  canRetry: false, canChangeCategory: false,
};

beforeEach(() => {
  authorize.mockReset();
  rpc.mockReset();
  authorize.mockResolvedValue({ user: { id: "e0014d65-4ec9-4ec8-bdca-166a69780807" } });
  rpc.mockResolvedValue({ data: snapshot, error: null });
});

describe("ride-status refresh API", () => {
  it("returns a valid snapshot and supplies missing nullable reason", async () => {
    const response = await GET(new Request(url), ctx);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(validMatch(body, id)).toBe(true);
    expect(body.cancellation.reason).toBeNull();
    expect(rpc).toHaveBeenCalledWith("rider_match_snapshot_server", {
      p_actor: "e0014d65-4ec9-4ec8-bdca-166a69780807",
      p_request_id: id,
    });
  });
  it("requires a verified account before requesting a snapshot", async () => {
    authorize.mockResolvedValue(null);
    expect((await GET(new Request(url), ctx)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("keeps server errors retryable without fabricating status", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "temporary" } });
    expect((await GET(new Request(url), ctx)).status).toBe(503);
  });
  it("uses the same verified identity for cancellation with idempotent version", async () => {
    rpc.mockResolvedValue({ data: { snapshot, conflict: true }, error: null });
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", expectedVersion: 1 }),
    }), ctx);
    expect(response.status).toBe(409);
    expect(validMatch(await response.json(), id)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("rider_request_action_server", {
      p_actor: "e0014d65-4ec9-4ec8-bdca-166a69780807",
      p_request_id: id, p_expected_version: 1, p_action: "cancel",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), admin: vi.fn() }));
vi.mock("../../lib/nexride-server-supabase", () => ({ authorizedRequestSupabase: mocks.authorize }));
vi.mock("../../lib/nexride-server-admin", () => ({ serverAdminSupabase: mocks.admin }));
import { GET } from "../../app/api/native/devices/route";
import { POST } from "../../app/api/native/notifications/test/route";

const user = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
let device: { id: string; enabled: boolean } | null;
let test: { status: string; created_at: string } | null;
let insertError: { code: string } | null;
let deviceError: { code: string } | null;
let inserted: Record<string, unknown>;
let scopes: Array<[string, string, unknown]>;
function query(table: string) {
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "gte", "order", "limit"]) chain[method] = vi.fn((...args: unknown[]) => {
    if (method === "eq") scopes.push([table, String(args[0]), args[1]]);
    return chain;
  });
  chain.maybeSingle = vi.fn(async () => ({ data: table === "nexride_push_devices" ? device : test, error: table === "nexride_push_devices" ? deviceError : null }));
  chain.insert = vi.fn(async (data: Record<string, unknown>) => { inserted = data; return { error: insertError }; });
  return chain;
}
beforeEach(() => {
  vi.clearAllMocks(); device = { id: "private-device-id", enabled: true }; test = null;
  insertError = null; deviceError = null; inserted = {}; scopes = [];
  mocks.authorize.mockResolvedValue({ user: { id: user } });
  mocks.admin.mockReturnValue({ from: vi.fn(query) });
});
const request = (payload: unknown = { role: "driver", installationId }) => new Request("https://example.test/api/native/notifications/test", { method: "POST", body: JSON.stringify(payload) });
const statusRequest = () => new Request("https://example.test/api/native/devices?" + new URLSearchParams({ role: "driver", installationId }));

describe("user-initiated notification tests", () => {
  it("queues only the verified account's installation, with time to minimize the app", async () => {
    const before = Date.now();
    const result = await POST(request({ role: "driver", installationId, userId: "another-user", token: "arbitrary-target", title: "custom-copy" }));
    expect(result.status).toBe(202); expect(await result.json()).toEqual({ status: "queued" });
    expect(scopes).toContainEqual(["nexride_push_devices", "user_id", user]);
    expect(scopes).toContainEqual(["nexride_push_devices", "installation_id", installationId]);
    expect(scopes).toContainEqual(["nexride_push_devices", "enabled", true]);
    expect(inserted).toMatchObject({ kind: "device_test", user_id: user, role: "driver", device_id: device!.id });
    expect(Date.parse(String(inserted.retry_at)) - Date.parse(String(inserted.created_at))).toBe(5000);
    expect(Date.parse(String(inserted.created_at))).toBeGreaterThanOrEqual(before);
    expect(inserted).not.toHaveProperty("token"); expect(inserted).not.toHaveProperty("title");
    expect(inserted).not.toHaveProperty("offer_id"); expect(inserted).not.toHaveProperty("request_id");
  });
  it("rejects unauthenticated calls before database access", async () => {
    mocks.authorize.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401); expect((await GET(statusRequest())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("rejects rider, malformed and null requests", async () => {
    expect((await POST(request({ role: "rider", installationId }))).status).toBe(400);
    expect((await POST(request({ role: "driver", installationId: "invalid" }))).status).toBe(400);
    expect((await POST(request(null))).status).toBe(400); expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("requires a registered device and does not invent a queued test after failure", async () => {
    device = null; expect((await POST(request())).status).toBe(409); expect(inserted).toEqual({});
    device = { id: "device", enabled: true }; insertError = { code: "XX000" };
    expect((await POST(request())).status).toBe(503);
    deviceError = { code: "XX000" }; expect((await GET(statusRequest())).status).toBe(503);
  });
  it("uses the database unique key to reject simultaneous repeated tests", async () => {
    insertError = { code: "23505" };
    const response = await POST(request()); expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ status: "test_rate_limited" });
    expect(inserted.dedupe_key).toMatch(new RegExp("^device-test:" + user + ":\\d+$"));
  });
  it("reports provider acceptance without exposing tokens or claiming delivery", async () => {
    test = { status: "sent", created_at: new Date().toISOString() };
    const response = await GET(statusRequest());
    expect(await response.json()).toEqual({ status: "checked", registered: true, testStatus: "accepted_by_fcm" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(scopes).toContainEqual(["nexride_push_outbox", "user_id", user]);
    expect(scopes).toContainEqual(["nexride_push_outbox", "device_id", device!.id]);
  });
  it("reports an expired queued test as not sent even when its worker is unavailable", async () => {
    test = { status: "pending", created_at: new Date(Date.now() - 61_000).toISOString() };
    expect((await (await GET(statusRequest())).json()).testStatus).toBe("not_sent");
  });
  it("reports unregistered installations without querying another account's test history", async () => {
    device = null;
    expect(await (await GET(statusRequest())).json()).toEqual({ status: "checked", registered: false, testStatus: null });
    expect(mocks.admin.mock.results[0].value.from).not.toHaveBeenCalledWith("nexride_push_outbox");
  });
});

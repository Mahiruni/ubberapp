import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), db: vi.fn(), profile: vi.fn(), query: vi.fn() }));
vi.mock("../../lib/nexride-server-supabase", () => ({ authorizedRequestSupabase: mocks.auth }));
vi.mock("../../lib/nexride-server-admin", () => ({ serverAdminSupabase: mocks.db }));
import { GET } from "../../app/api/admin/service-quality/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin" } });
  mocks.profile.mockResolvedValue({ data: { role: "admin", account_status: "active" }, error: null });
  mocks.query.mockResolvedValue({ data: [], error: null, count: 0 });
  const chain: any = {};
  for (const key of ["select", "eq", "gte", "lte", "order"]) chain[key] = vi.fn(() => chain);
  chain.maybeSingle = mocks.profile; chain.range = mocks.query;
  mocks.db.mockReturnValue({ from: vi.fn(() => chain) });
});
describe("service quality endpoint", () => {
  it("denies anonymous requests before reading the database", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request("https://example.test/api/admin/service-quality"))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["rider", "driver"])("denies %s accounts before reading ride records", async role => {
    mocks.profile.mockResolvedValue({ data: { role, account_status: "active" }, error: null });
    expect((await GET(new Request("https://example.test/api/admin/service-quality"))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("denies suspended admins", async () => {
    mocks.profile.mockResolvedValue({ data: { role: "admin", account_status: "suspended" }, error: null });
    expect((await GET(new Request("https://example.test/api/admin/service-quality"))).status).toBe(403);
  });
  it("rejects unsupported windows", async () => {
    expect((await GET(new Request("https://example.test/api/admin/service-quality?days=365"))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("returns private aggregates with an explicit sampling indicator", async () => {
    mocks.query.mockResolvedValue({ data: [{ status: "completed", created_at: "2026-10-16T08:00:00Z", accepted_at: null, rider_id: "private-rider", cancelled_by: null }], error: null, count: 1400 });
    const response = await GET(new Request("https://example.test/api/admin/service-quality?days=7"));
    const body = await response.json();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({ sampled: true, totalRequests: 1400, metrics: { observedRequests: 1, completed: 1 } });
    expect(JSON.stringify(body)).not.toContain("private-rider");
  });
  it("fails closed on provider errors instead of reporting zero rides", async () => {
    mocks.query.mockResolvedValue({ data: null, error: { message: "unavailable" }, count: null });
    const response = await GET(new Request("https://example.test/api/admin/service-quality"));
    expect(response.status).toBe(503); expect(await response.json()).not.toHaveProperty("metrics");
  });
});

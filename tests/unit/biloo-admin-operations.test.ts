import { beforeEach, describe, expect, it, vi } from "vitest";
const { authorized, serverAdmin } = vi.hoisted(() => ({ authorized: vi.fn(), serverAdmin: vi.fn() }));
vi.mock("../../lib/nexride-server-supabase", () => ({ authorizedRequestSupabase: authorized }));
vi.mock("../../lib/nexride-server-admin", () => ({ serverAdminSupabase: serverAdmin }));
import { GET } from "../../app/api/admin/operations/route";
const id = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
function backend(role = "admin", status = "active", sectionError = false) {
  const from = vi.fn((table: string) => {
    const response = table === "profiles" ? { data: { role, account_status: status }, error: null }
      : table === "ride_requests" ? { data: { id, status: "pending", payment_status: "pending" }, error: null }
        : { data: [], error: sectionError ? { message: "private_database_error" } : null };
    const query = {
      select: () => query, eq: () => query, order: () => query, limit: () => query,
      abortSignal: () => query, maybeSingle: async () => response,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve),
    };
    return query;
  });
  authorized.mockResolvedValue({ user: { id }, client: { from } });
  return from;
}
const request = (suffix = `kind=ride&id=${id}`) => new Request("http://localhost/api/admin/operations?" + suffix);
beforeEach(() => vi.clearAllMocks());
describe("read-only Admin operations", () => {
  it("requires a verified identity before reading operational data", async () => {
    authorized.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
  });
  it.each(["rider", "driver"])("denies %s access without querying trip or financial records", async role => {
    const from = backend(role);
    expect((await GET(request())).status).toBe(403);
    expect(from).toHaveBeenCalledExactlyOnceWith("profiles");
    expect(serverAdmin).not.toHaveBeenCalled();
  });
  it("rejects inactive administrators", async () => {
    backend("admin", "suspended");
    expect((await GET(request())).status).toBe(403);
  });
  it("rejects arbitrary record filters before accessing them", async () => {
    const from = backend();
    expect((await GET(request("kind=ride&id=invalid,or=(true)"))).status).toBe(400);
    expect(from).toHaveBeenCalledExactlyOnceWith("profiles");
  });
  it("returns saved pending payment state and honest empty related records", async () => {
    backend();
    const response = await GET(request());
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.record.payment_status).toBe("pending");
    expect(result.sections.find((item: {title: string}) => item.title === "Payment records").rows).toEqual([]);
    expect(result.note).toContain("do not confirm payment");
  });
  it("distinguishes failed section loads from an empty history without leaking database details", async () => {
    backend("admin", "active", true);
    const response = await GET(request());
    const result = await response.json();
    expect(result.sections.every((item: {unavailable: boolean}) => item.unavailable)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private_database_error");
  });
});

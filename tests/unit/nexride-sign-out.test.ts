import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { signOut, getSession } = vi.hoisted(() => ({ signOut: vi.fn(), getSession: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { signOut, getSession } } }));
import { signOutNexRide } from "../../lib/nexride-sign-out";
import { EXPLICIT_SIGNOUT_KEY, explicitSignOutRole, retryStartup } from "../../lib/nexride-startup";
let storage: Storage;
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  } as Storage;
  vi.stubGlobal("window", { localStorage: storage });
  vi.stubGlobal("localStorage", storage);
  retryStartup();
  signOut.mockReset().mockResolvedValue({ error: null });
  getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("NexRide explicit logout", () => {
  for (const role of ["rider", "driver"] as const) {
    it("blocks session restore before " + role + " logout finishes", async () => {
      let finish!: (v: unknown) => void;
      signOut.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
      const pending = signOutNexRide(role);
      expect(explicitSignOutRole(storage)).toBe(role);
      expect(data.get(EXPLICIT_SIGNOUT_KEY)).toBe(role);
      expect(signOut).toHaveBeenCalledWith({ scope: "local" });
      finish({ error: null });
      await pending;
      expect(explicitSignOutRole(storage)).toBe(role);
      expect(getSession).toHaveBeenCalledOnce();
    });
  }
  it("retains the logout barrier when clearing local credentials fails", async () => {
    signOut.mockResolvedValueOnce({ error: new Error("offline") });
    await expect(signOutNexRide("driver")).rejects.toThrow("offline");
    expect(explicitSignOutRole(storage)).toBe("driver");
  });
  it("rejects a stale Supabase session after logout", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: "stale" } }, error: null });
    await expect(signOutNexRide("rider")).rejects.toThrow("not fully cleared");
    expect(explicitSignOutRole(storage)).toBe("rider");
  });
});

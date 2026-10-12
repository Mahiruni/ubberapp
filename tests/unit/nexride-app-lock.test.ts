import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  native: false, platform: "web", available: true,
  status: vi.fn(), open: vi.fn(), lock: vi.fn(), session: vi.fn(), register: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    getPlatform: () => mocks.platform,
    isPluginAvailable: () => mocks.available,
  },
  registerPlugin: (...args: unknown[]) => {
    mocks.register(...args);
    return { status: mocks.status, openSettings: mocks.open, lockNow: mocks.lock };
  },
}));
vi.mock("../../lib/supabase", () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { getAppLockStatus, openAppLockSettings, lockNexRideNow } from "../../lib/nexride-app-lock";

describe("native app-lock bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.native = true; mocks.platform = "android"; mocks.available = true;
    mocks.session.mockResolvedValue({ data: { session: { access_token: "session-token" } }, error: null });
    mocks.status.mockResolvedValue({ enabled: false, locked: false });
  });
  it("does not simulate security in browsers or unsupported iOS shells", async () => {
    for (const [native, platform] of [[false, "web"], [true, "ios"]] as const) {
      mocks.native = native; mocks.platform = platform;
      expect(await getAppLockStatus()).toBeNull();
      await expect(openAppLockSettings("en")).rejects.toThrow("android_app_required");
      await lockNexRideNow();
    }
    expect(mocks.register).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("requires an APK with the real native gate", async () => {
    mocks.available = false;
    await expect(getAppLockStatus()).rejects.toThrow("app_update_required");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("refuses settings when there is no session or Auth reports an error", async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null });
    await expect(openAppLockSettings("en")).rejects.toThrow("sign_in_required");
    mocks.session.mockResolvedValue({ data: { session: { access_token: "stale" } }, error: new Error("expired") });
    await expect(openAppLockSettings("am")).rejects.toThrow("sign_in_required");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("passes only the current token and language to the native password-verification screen", async () => {
    await openAppLockSettings("am");
    expect(mocks.open).toHaveBeenCalledWith({ accessToken: "session-token", language: "am" });
    expect(mocks.register).toHaveBeenCalledWith("NexRideAppLock");
  });
  it("propagates native failures instead of displaying a successful lock", async () => {
    mocks.lock.mockRejectedValueOnce(new Error("native_failed"));
    await expect(lockNexRideNow()).rejects.toThrow("native_failed");
  });
});

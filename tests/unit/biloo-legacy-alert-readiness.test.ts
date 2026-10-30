import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  app: vi.fn(), permission: vi.fn(), channels: vi.fn(), api: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true }, registerPlugin: vi.fn() }));
vi.mock("@capacitor/app", () => ({ App: { getInfo: mocks.app } }));
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: { checkPermissions: mocks.permission, listChannels: mocks.channels } }));
vi.mock("../../lib/nexride-api-auth", () => ({ nexrideApiFetch: mocks.api }));
vi.mock("../../lib/supabase", () => ({ supabase: {} }));
vi.mock("../../lib/biloo-native-ride-alerts", () => ({ nativeRideAlertsPlugin: vi.fn(), markNativeRideAlertRegistration: vi.fn(), disableNativeRideAlerts: vi.fn() }));
import { nativePushReadiness, sendNativeDriverNotificationTest } from "../../lib/nexride-native-reliability";
const installation = "22222222-2222-4222-8222-222222222222";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", { getItem: () => installation });
  mocks.app.mockResolvedValue({ id: "com.nexride.driver" });
  mocks.permission.mockResolvedValue({ receive: "granted" });
  mocks.channels.mockResolvedValue({ channels: [{ id: "nexride_driver_requests_v2", importance: 4, sound: "android.resource://test/chime", vibration: true }] });
  mocks.api.mockImplementation(async () => Response.json({ registered: true, testStatus: "accepted_by_fcm" }));
});
afterEach(() => vi.unstubAllGlobals());
describe("legacy Driver APK notification controls", () => {
  it("checks the real registration and channel without requiring the new native plugin", async () => {
    expect(await nativePushReadiness("driver")).toEqual({ registered: true, permissionGranted: true, channelEnabled: true, headsUpEnabled: true, soundEnabled: true, vibrationEnabled: true, testStatus: "accepted_by_fcm" });
    expect(mocks.api).toHaveBeenCalledWith("/api/native/devices?role=driver&installationId=" + installation);
  });
  it("keeps unknown channel settings unknown and respects denied permission", async () => {
    mocks.channels.mockRejectedValue(new Error("old Android")); mocks.permission.mockResolvedValue({ receive: "denied" });
    expect(await nativePushReadiness("driver")).toMatchObject({ permissionGranted: false, channelEnabled: undefined, soundEnabled: undefined });
  });
  it("does not claim registration when the server check fails", async () => {
    mocks.api.mockResolvedValue(Response.json({ status: "unavailable" }, { status: 503 }));
    expect(await nativePushReadiness("driver")).toBeNull();
  });
  it("queues the server test for only the verified Driver app installation", async () => {
    mocks.api.mockResolvedValue(Response.json({ status: "queued" }, { status: 202 }));
    expect(await sendNativeDriverNotificationTest()).toBe("queued");
    expect(mocks.api).toHaveBeenCalledWith("/api/native/notifications/test", { method: "POST", body: JSON.stringify({ role: "driver", installationId: installation }) });
  });
  it("blocks a Rider package from requesting Driver tests", async () => {
    mocks.app.mockResolvedValue({ id: "com.nexride.rider" });
    expect(await sendNativeDriverNotificationTest()).toBe("wrong_app_role");
    expect(await nativePushReadiness("driver")).toBeNull(); expect(mocks.api).not.toHaveBeenCalled();
  });
});

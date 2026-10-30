import { describe, expect, it } from "vitest";
import { notificationTestSettingsUrl, notificationTestTtlSeconds } from "../../lib/biloo-notification-test";
import { nexridePushDestination } from "../../lib/nexride-push-routing";
describe("notification test expiry and navigation", () => {
  it("only opens the canonical Driver settings from a device-test notification", () => {
    expect(nexridePushDestination({ kind: "device_test", url: notificationTestSettingsUrl }, "driver")).toBe(notificationTestSettingsUrl);
    expect(nexridePushDestination({ kind: "device_test", url: notificationTestSettingsUrl }, "rider")).toBeNull();
    expect(nexridePushDestination({ kind: "driver_offer", url: notificationTestSettingsUrl }, "driver")).toBeNull();
  });
  it("bounds delayed-test lifetime and rejects invalid or future timestamps", () => {
    const now = Date.now();
    expect(notificationTestTtlSeconds(new Date(now - 5000).toISOString(), now)).toBe(30);
    expect(notificationTestTtlSeconds(new Date(now - 58000).toISOString(), now)).toBe(2);
    expect(notificationTestTtlSeconds(new Date(now - 61000).toISOString(), now)).toBe(0);
    expect(notificationTestTtlSeconds(new Date(now + 10000).toISOString(), now)).toBe(0);
    expect(notificationTestTtlSeconds("invalid", now)).toBe(0);
  });
});

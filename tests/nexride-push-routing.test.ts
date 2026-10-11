import { describe, expect, it } from "vitest";
import { nexrideDriverOfferTtlSeconds, nexridePushDestination } from "../lib/nexride-push-routing";

const id = "8b2df275-69d1-48b0-a4e8-f9f4cc0b8f33";
const url = `/driver/request?offer=${id}`;
const now = Date.parse("2026-10-11T20:00:00.000Z");

describe("FCM notification safety", () => {
  it("opens valid Driver offers while they remain active", () => {
    expect(nexridePushDestination({ url, expiresAt: new Date(now + 20000).toISOString() }, "driver", now)).toBe(url);
  });
  it("routes stale alerts to Driver activity rather than an expired action", () => {
    expect(nexridePushDestination({ url, expiresAt: new Date(now - 1000).toISOString() }, "driver", now)).toBe("/driver/activity");
  });
  it("blocks cross-role, malicious or malformed deep links", () => {
    expect(nexridePushDestination({ url }, "rider", now)).toBeNull();
    expect(nexridePushDestination({ url: "https://evil.example/" }, "driver", now)).toBeNull();
    expect(nexridePushDestination({ url: "/driver/request?offer=bad" }, "driver", now)).toBeNull();
    expect(nexridePushDestination({ url: "/rider/trips" }, "rider", now)).toBe("/rider/trips");
  });
  it("caps FCM time-to-live by real remaining offer time", () => {
    expect(nexrideDriverOfferTtlSeconds(new Date(now + 80000).toISOString(), now)).toBe(25);
    expect(nexrideDriverOfferTtlSeconds(new Date(now + 12000).toISOString(), now)).toBe(12);
    expect(nexrideDriverOfferTtlSeconds(new Date(now + 1500).toISOString(), now)).toBe(0);
    expect(nexrideDriverOfferTtlSeconds("not-a-date", now)).toBe(0);
  });
});

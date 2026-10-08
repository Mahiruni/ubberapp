import { describe, expect, it } from "vitest";
import { DRIVER_CORE_MENU_ITEMS, driverCoreMenuForPath } from "../../lib/nexride-driver-menu";

describe("NexRide Driver essential navigation", () => {
  it("contains exactly the requested six categories without duplicates", () => {
    expect(DRIVER_CORE_MENU_ITEMS.map(item => item.en)).toEqual([
      "Earnings & Wallet",
      "Safety Toolkit & SOS",
      "Profile & Ratings",
      "Vehicles & Compliance",
      "Preferences & Navigation",
      "Support Inbox & Help",
    ]);
    expect(new Set(DRIVER_CORE_MENU_ITEMS.map(item => item.id)).size).toBe(6);
    expect(new Set(DRIVER_CORE_MENU_ITEMS.map(item => item.href)).size).toBe(6);
    expect(DRIVER_CORE_MENU_ITEMS.every(item => item.am && item.detailEn && item.detailAm)).toBe(true);
  });
  it("does not reintroduce Home, Requests or standalone utility entries", () => {
    const ids = DRIVER_CORE_MENU_ITEMS.map(item => item.id);
    expect(ids).not.toContain("home");
    expect(ids).not.toContain("requests");
    expect(ids).not.toContain("settings");
    expect(ids).not.toContain("messages");
    expect(ids).not.toContain("account");
  });
  it("highlights the appropriate category on existing nested routes", () => {
    expect(driverCoreMenuForPath("/driver/profile/payouts")).toBe("earnings");
    expect(driverCoreMenuForPath("/driver/profile/documents")).toBe("vehicle");
    expect(driverCoreMenuForPath("/driver/verification")).toBe("vehicle");
    expect(driverCoreMenuForPath("/driver/profile/settings")).toBe("preferences");
    expect(driverCoreMenuForPath("/driver/profile")).toBe("profile");
    expect(driverCoreMenuForPath("/support")).toBe("support");
    expect(driverCoreMenuForPath("/safety")).toBe("safety");
    expect(driverCoreMenuForPath("/driver/request")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { driverExternalNavigationUrl, isDriverNavigationProvider } from "../../lib/nexride-driver-navigation-provider";

describe("Driver external navigation preference", () => {
  it("only accepts the two supported providers", () => {
    expect(isDriverNavigationProvider("google")).toBe(true);
    expect(isDriverNavigationProvider("waze")).toBe(true);
    expect(isDriverNavigationProvider("unknown")).toBe(false);
  });
  it("creates Google Maps directions to coordinates", () => {
    const result = driverExternalNavigationUrl({lat:9.03,lng:38.74},"Addis Ababa","google");
    expect(result).toContain("https://www.google.com/maps/dir/?api=1");
    expect(result).toContain("destination=9.03%2C38.74");
  });
  it("creates Waze deep links to coordinates", () => {
    const result = driverExternalNavigationUrl({lat:9.03,lng:38.74},"Addis Ababa","waze");
    expect(result).toBe("https://www.waze.com/ul?ll=9.03%2C38.74&navigate=yes");
  });
  it("falls back to Google when Waze has no coordinates", () => {
    const result = driverExternalNavigationUrl(null,"Bole Airport","waze");
    expect(result).toContain("google.com/maps");
    expect(result).toContain("Bole%20Airport");
  });
});

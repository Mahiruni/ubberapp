import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Biloo Rider and Driver fast-launch architecture", () => {
  const startup = read("lib/nexride-startup.ts");
  const riderPage = read("app/page.tsx");
  const driverWorkspace = read("components/nexride/driver.tsx");
  const driverHome = read("app/driver/home/page.tsx");
  const driverMap = read("app/driver/map/page.tsx");
  const driverWelcome = read("app/driver/page.tsx");
  const driverVerification = read("lib/nexride-driver-verification.ts");
  const riderMap = read("components/nexride/rider-map.tsx");
  const layout = read("app/layout.tsx");

  it("reuses the database-verified Rider role rather than fetching it twice", () => {
    expect(startup).toContain('accountRole: activeRiderRole ? "rider" : role');
    expect(riderPage).toContain("result.accountRole !== undefined");
    expect(riderPage).toContain('setIsAdmin(accountRole === "admin")');
    expect(startup).toContain("resolveSessionRole(session)");
    expect(startup).toContain("explicitSignOutRole(window.localStorage)");
  });

  it("defers heavy Driver Mapbox, earnings and photo-profile bundles", () => {
    expect(driverWorkspace).toContain('dynamic(\n  () => import("./rider-map")');
    expect(driverWorkspace).toContain('dynamic(\n  () => import("./driver-earnings")');
    expect(driverWorkspace).toContain('dynamic(\n  () => import("./driver-profile")');
    expect(driverWorkspace).not.toContain('import { RiderMap } from "./rider-map"');
    expect(driverWorkspace).toContain('markerRole="driver"');
    expect(driverWorkspace).toContain("nr-driver-home-swipe");
  });

  it("authorizes Driver and checks verification concurrently, never bypassing gates", () => {
    for (const page of [driverHome, driverMap]) {
      expect(page).toContain("Promise.all([");
      expect(page).toContain("resolveSessionRole(");
      expect(page).toContain("getDriverReviewStatus(");
      expect(page).toContain('role !== "driver"');
      expect(page).toContain('reviewStatus === "draft" || reviewStatus === "rejected"');
      expect(page).toContain('driver_onboarding_complete !== true');
    }
    expect(driverWorkspace).toContain("const [accountRole, driverResult] = await Promise.all([");
    expect(driverWorkspace).toContain('accountRole !== "driver"');
  });

  it("avoids another profile-role query when Driver welcome already verified it", () => {
    expect(driverWelcome).toContain("driverResumeDestination(session, role)");
    expect(driverVerification).toContain("alreadyVerifiedRole ?? await resolveSessionRole(session)");
    expect(driverVerification).toContain('if (role !== "driver") return "/driver/auth"');
  });

  it("loads map search lazily, with location and map rendering independent", () => {
    expect(riderMap).toContain('void import("@mapbox/mapbox-gl-geocoder").then(');
    expect(riderMap).toContain("if (cancelled || mapRef.current !== map) return");
    expect(riderMap).not.toContain('import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder"');
    expect(riderMap).toContain('map.on("load"');
    expect(riderMap).toContain("syncRoutes(map, journeyRef.current)");
  });

  it("keeps Amharic glyph rendering but does not preload its font for English launch", () => {
    expect(layout).not.toContain('rel="preload"');
    const fonts = read("app/ethiopic-font.css");
    expect(fonts).toContain('font-display: swap');
    expect(fonts).toContain('unicode-range:');
  });
});

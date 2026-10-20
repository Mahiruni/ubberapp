import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

describe("Biloo app brand and navigation integrity", () => {
  const app = source("app/page.tsx");
  const driver = source("components/nexride/driver.tsx");
  const driverCss = source("app/driver/driver-shell.css");
  const driverHomeCss = source("app/driver/driver-home-v2.css");
  const riderRideCss = source("app/ride-selection.css");
  const menuCss = source("app/biloo-home-clean.css");

  it("retains a menu during Rider booking, matching and active-trip map screens", () => {
    expect(app).toContain('riderMapView && !riderSearch && (');
    expect(app).toContain('data-context={riderHome ? "home" : "journey"}');
    expect(app).toContain('!riderMapView && (');
    expect(app).toContain('id !== "safety" && id !== "messages"');
    expect(menuCss).toContain('.biloo-home-floating-header[data-context="journey"]');
    expect(menuCss).toContain("right: max(12px,env(safe-area-inset-right,0px));");
  });

  it("uses gold for Biloo choice states but leaves live statuses green", () => {
    expect(driverCss).not.toContain("--driver-accent:#00c878");
    expect(driverCss).toContain("--driver-accent:#f9c449");
    expect(driverHomeCss).not.toContain(".nr-driver-app-shell{--driver-accent:#00c878");
    expect(riderRideCss).toContain("background: #f9c449;");
    expect(riderRideCss).toContain("background: #fff9e9;");
    expect(driverHomeCss).toContain("--driver-success:#00b77a");
  });

  it("keeps detailed GPS states accessible without long overlays on the map", () => {
    expect(driver).toContain("const gpsBadgeMessage = ");
    expect(driver).toContain("aria-label={gpsHealthMessage}");
    expect(driver).toContain("{gpsBadgeMessage}");
    expect(driverHomeCss).toContain("calc(100vw - 128px)");
    expect(driverHomeCss).toContain("flex-direction: row!important;");
  });
});

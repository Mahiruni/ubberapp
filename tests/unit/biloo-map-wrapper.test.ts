import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const driver = source("components/nexride/driver.tsx");
const shell = source("components/nexride/driver-app-shell.tsx");
const driverCSS = source("app/driver/driver-wrapper-premium.css");
const riderCSS = source("app/rider-sheet-standard.css");

describe("Biloo map-first wrapper design", () => {
  it("removes Driver home quick-action tiles without removing the availability swipe", () => {
    expect(driver).not.toContain('className="nr-driver-home-quick-actions"');
    expect(driver).not.toContain('router.push("/driver/activity")');
    expect(driver).not.toContain('router.push("/driver/earnings")');
    expect(driver).not.toContain('router.push("/driver/profile/settings")');
    expect(driver).toContain("<DriverAvailabilitySwipe");
    expect(driver).toContain("onToggle={toggleAvailability}");
    expect(driver).toContain("nr-driver-home-map-canvas");
  });

  it("preserves Activity, Earnings, Settings in the accessible hamburger", () => {
    for (const href of ["/driver/activity", "/driver/earnings"]) {
      expect(shell).toContain('href: "' + href + '"');
    }
    expect(shell).toContain('href="/driver/profile/settings"');
    expect(shell).toContain('aria-expanded={open}');
  });

  it("gives Driver home one full-width docked sheet without a floating margin", () => {
    expect(driverCSS).toContain('left: 0 !important');
    expect(driverCSS).toContain('bottom: 0 !important');
    expect(driverCSS).toContain('width: 100% !important');
    expect(driverCSS).toContain('border-radius: 24px 24px 0 0 !important');
    expect(driverCSS).toContain('env(safe-area-inset-bottom,0px)');
    expect(driverCSS).toContain('nr-driver-home-control-panel .nr-driver-availability-swipe');
    expect(driverCSS).toContain('nr-driver-navigation-page .nr-nav-bottom-card');
    expect(driverCSS).toContain('nr-driver-request-page .nr-request-sheet');
  });

  it("keeps Rider booking and trip wrappers visually consistent", () => {
    for (const className of [".nr-rider-home-sheet", ".nr-destination-panel", ".nr-ride-selection", ".nr-driver-matching", ".nr-trip-experience"]) {
      expect(riderCSS).toContain(className);
    }
    expect(riderCSS).toContain('nr-rider-persistent-wrapper');
    expect(riderCSS).toContain('background: #fff !important');
    expect(riderCSS).toContain('nr-flow-sheet-handle > span');
  });
});

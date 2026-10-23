import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const rider = read("app/page.tsx");
const driver = read("components/nexride/driver-app-shell.tsx");
const driverHome = read("components/nexride/driver.tsx");
const trips = read("app/rider/trips/page.tsx");
const wallet = read("app/rider/wallet/page.tsx");
const support = read("app/support/page.tsx");
const css = read("app/biloo-footer-navigation.css");
const premiumDriver = read("app/driver/driver-wrapper-premium.css");
const riderMenu = read("components/nexride/rider-menu.tsx");
const registry = read("lib/biloo-navigation-registry.ts");

describe("Biloo Rider + Driver navigation without a footer tab bar", () => {
  it("does not mount footer tabs or the legacy mobile driver dock", () => {
    for (const page of [rider, driver, trips, wallet, support]) {
      expect(page).not.toContain("<BilooFooterNav");
      expect(page).not.toContain('from "../components/nexride/biloo-footer-nav"');
      expect(page).not.toContain('from "./biloo-footer-nav"');
    }
    expect(rider).not.toContain('<div className="nr-mobile-nav"');
    expect(css).not.toContain("display: flex;\n    align-items: stretch;");
    expect(premiumDriver).not.toContain("--biloo-dock-bar-height");
  });

  it("keeps a usable navigation and distinct profile destination for both roles", () => {
    expect(rider).toContain("<RiderMenu");
    expect(rider).not.toContain('className="biloo-home-floating-profile"');
    expect(riderMenu).toContain('className="biloo-menu-profile-card"');
    expect(riderMenu).toContain('aria-label={open ? say("Close menu"');
    expect(driver).toContain("<DriverHamburgerMenu");
    expect(driver).not.toContain('className="nr-driver-header-profile"');
    expect(driver).toContain('className="biloo-menu-profile-card"');
    expect(driver).toContain('href="/driver/profile"');
    expect(driver).toContain("DRIVER_NAVIGATION.map");
    expect(registry).toContain('href:"/driver/earnings"');
    expect(registry).toContain('href:"/driver/map"');
  });

  it("keeps Driver availability swipe but removes all three embedded quick-action buttons", () => {
    expect(driverHome).toContain("<DriverAvailabilitySwipe");
    expect(driverHome).toContain("onToggle={toggleAvailability}");
    expect(driverHome).toContain('className="nr-driver-home-control-panel"');
    expect(driverHome).not.toContain("nr-driver-home-quick-actions");
    expect(driverHome).not.toContain('router.push("/driver/activity")}><Icon name="clock"');
    expect(driverHome).not.toContain('router.push("/driver/earnings")}><Icon name="wallet"');
    expect(driverHome).not.toContain('router.push("/driver/profile/settings")}><Icon name="settings"');
  });

  it("preserves map sheets and safe areas without leaving an empty footer gap", () => {
    expect(css).toContain('bottom: 0!important;');
    expect(css).toContain("env(safe-area-inset-bottom,0px)");
    expect(css).toContain(".nr-home-sheet-scroll");
    expect(css).toContain(".nr-driver-home-swipe");
    expect(css).not.toContain(".biloo-footer-nav__item");
    expect(premiumDriver).toContain("height: calc(100dvh - var(--driver-header-total,62px) - env(safe-area-inset-bottom,0px))!important;");
  });
});

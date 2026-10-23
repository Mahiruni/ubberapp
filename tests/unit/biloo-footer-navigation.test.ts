import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const rider = read("app/page.tsx");
const driver = read("components/nexride/driver-app-shell.tsx");
const riderMenu = read("components/nexride/rider-menu.tsx");
const trips = read("app/rider/trips/page.tsx");
const wallet = read("app/rider/wallet/page.tsx");
const support = read("app/support/page.tsx");
const menuCss = read("app/biloo-menu-refinement.css");
const dockCss = read("app/biloo-footer-navigation.css");
const driverCss = read("app/driver/driver-wrapper-premium.css");
const layout = read("app/layout.tsx");

describe("Biloo drawer-only Rider and Driver navigation", () => {
  it("removes the bottom dock from Rider, Driver, trips, wallet and support pages", () => {
    for (const file of [rider, driver, trips, wallet, support]) {
      expect(file).not.toContain("<BilooFooterNav");
      expect(file).not.toContain("biloo-footer-nav\"");
    }
    expect(dockCss).toContain("display: none !important");
    expect(dockCss).toContain(".nr-app .nr-mobile-nav");
    expect(layout).toContain('import "./biloo-footer-navigation.css";');
  });

  it("keeps the former Rider destinations available from the hamburger", () => {
    expect(riderMenu).toContain('home: "/"');
    expect(riderMenu).toContain('trips: "/rider/trips"');
    expect(riderMenu).toContain('wallet: "/rider/wallet"');
    expect(riderMenu).toContain('profile: "/?screen=profile"');
    expect(riderMenu).toContain("renderRows(items.slice(0,4))");
    expect(riderMenu).toContain("renderRows(items.slice(6,8))");
    expect(riderMenu).toContain("Drive with Biloo");
    expect(rider).toContain("<RiderMenu");
    expect(trips).toContain('<RiderMenu active="trips"');
    expect(wallet).toContain('<RiderMenu active="wallet"');
  });

  it("keeps Driver Home, Activity, Map, Earnings, Account and role switching", () => {
    for (const route of ["/driver/home", "/driver/activity", "/driver/map", "/driver/earnings", "/driver/profile"]) {
      expect(driver).toContain('href: "' + route + '"');
    }
    expect(driver).toContain("menuRows(driveItems)");
    expect(driver).toContain("menuRows(accountItems)");
    expect(driver).toContain('href="/rider"');
    expect(driver).toContain("Switch to Rider");
    expect(driver).toContain("registerNexRideBackHandler");
  });

  it("uses accessible left-hand drawers with backdrop, safe-area layout and reduced motion", () => {
    expect(menuCss).toContain("justify-content: flex-start !important");
    expect(menuCss).toContain("bilooDrawerLeft");
    expect(menuCss).toContain("prefers-reduced-motion: reduce");
    expect(driverCss).toContain("left: max(12px,env(safe-area-inset-left,0px)) !important");
    expect(dockCss).toContain("--biloo-dock-bar-height: 0px !important");
    expect(dockCss).toContain(".nr-home-sheet-scroll");
    expect(dockCss).toContain("scroll-padding-bottom");
    expect(dockCss).toContain("env(safe-area-inset-bottom,0px)");
    expect(driver).toContain('aria-expanded={open}');
    expect(riderMenu).toContain('aria-expanded={open}');
    expect(driver).toContain('event.key === "Escape"');
    expect(riderMenu).toContain('event.key === "Escape"');
  });
});

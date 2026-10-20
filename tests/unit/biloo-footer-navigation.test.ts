import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const footer = read("components/nexride/biloo-footer-nav.tsx");
const rider = read("app/page.tsx");
const driver = read("components/nexride/driver-app-shell.tsx");
const css = read("app/biloo-footer-navigation.css");
const layout = read("app/layout.tsx");

describe("Biloo approved Rider and Driver footer menus", () => {
  it("contains the five Rider items and the five Driver items in approved order", () => {
    const riderItems = footer.slice(footer.indexOf("export function riderFooterLinks"),footer.indexOf("export function driverFooterLinks"));
    const driverItems = footer.slice(footer.indexOf("export function driverFooterLinks"));
    expect([...riderItems.matchAll(/id: "([^"]+)"/g)].map(m => m[1])).toEqual(["home","activity","wallet","support","account"]);
    expect([...driverItems.matchAll(/id: "([^"]+)"/g)].map(m => m[1])).toEqual(["home","trips","earnings","support","account"]);
    expect(footer).toContain('href: "/rider/trips"');
    expect(footer).toContain('href: "/rider/wallet"');
    expect(footer).toContain('href: "/driver/activity"');
    expect(footer).toContain('href: "/driver/earnings"');
    expect(footer).toContain('href: "/support?role=driver"');
  });

  it("binds the actual Rider home and Driver shell to footer navigation", () => {
    expect(rider).toContain('<BilooFooterNav');
    expect(rider).toContain('role="rider"');
    expect(rider).toContain('() => navigate("profile")');
    expect(driver).toContain('<BilooFooterNav');
    expect(driver).toContain('role="driver"');
    expect(driver).toContain('!tripFocus && (');
    expect(rider).toContain('!riderSearch && !riderTripView');
    expect(rider).toContain('!["rides", "finding"].includes(riderScreen)');
  });

  it("preserves booking swipe, safe areas, active states and reduced motion", () => {
    expect(layout).toContain('import "./biloo-footer-navigation.css";');
    expect(css).toContain("repeat(5,minmax(0,1fr))");
    expect(css).toContain(".nr-driver-home-swipe[data-map-input-boundary=\"true\"]");
    expect(css).toContain(".nr-rider-flow-panel");
    expect(css).toContain("env(safe-area-inset-bottom,0px)");
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(footer).toContain('aria-current={selected ? "page" : undefined}');
    expect(footer).toContain("biloo-footer-nav__indicator");
  });
});

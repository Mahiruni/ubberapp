import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("Biloo Rider homepage clarity", () => {
  const home = source("components/nexride/rider-home.tsx");
  const app = source("app/page.tsx");
  const css = source("app/biloo-home-clean.css");

  it("does not duplicate the Biloo brand inside the booking sheet", () => {
    expect(home).not.toContain("<Brand");
    expect(home).not.toContain("YOUR WAY FORWARD");
    expect(home).toContain('className="nr-rider-home-intro"');
    expect(home).toContain("Search destination");
  });

  it("keeps one map-mounted navigation menu on the home screen", () => {
    expect(app).toContain("biloo-home-floating-header");
    expect(app).toContain('!riderHome && (');
    expect(app).toContain('active="home"');
    expect(app).toContain('import "./biloo-home-clean.css";');
    expect(css).toContain(".biloo-home-floating-header");
  });

  it("removes the routes CTA entirely and keeps one circle, one wordmark, one profile", () => {
    expect(home).not.toContain("Explore routes across Ethiopia");
    expect(home).not.toContain("biloo-route-home-entry");
    expect(home).not.toContain('href="/routes"');
    const floating = app.slice(app.indexOf('className="biloo-home-floating-header"'), app.indexOf('className="biloo-home-floating-profile"'));
    expect(floating).toContain("<RiderMenu");
    expect(floating).not.toContain("<Brand");
    expect(app).toContain('{mode === "rider" && !riderHome && (');
    expect(css).toContain("border-radius: 50%!important;");
    expect(css).toContain(".nr-topbar-actions");
    expect(css).toContain('width:52px;height:52px;min-width:52px;');
  });

  it("retains the existing 40 percent sheet, drag handle and operational flows", () => {
    expect(home).toContain("defaultRatio: 0.4");
    expect(home).toContain("...motion.handleProps");
    expect(home).toContain("onClick={navigate}");
    expect(home).toContain("onClick={() => shortcut(kind)}");
    expect(css).toContain("rider-home-view");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".nr-location-permission,.nr-gps-status");
    expect(css).toContain("flex-direction: row!important;");
    expect(css).not.toContain("mapboxgl-map");
    expect(css).not.toContain("leaflet-container");
  });
});

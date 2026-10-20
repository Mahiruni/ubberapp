import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app/biloo-contrast-system.css"), "utf8");
const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
const contrast = (a: string, b: string) => {
  const luminance = (h: string) => {
    const parts = h.replace("#", "").match(/../g);
    if (!parts || parts.length !== 3) throw Error("Expected six-digit hex");
    const values = parts.map(v => Number.parseInt(v, 16) / 255).map(v =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("Biloo full-app AA contrast design tokens", () => {
  it.each([
    ["light body", "#132a48", "#ffffff"],
    ["light muted", "#53657e", "#ffffff"],
    ["light on raised", "#53657e", "#eef3f9"],
    ["light placeholder", "#586a80", "#eef3f9"],
    ["dark body", "#ffffff", "#10386f"],
    ["dark muted", "#d5dfed", "#10386f"],
    ["dark on raised", "#d5dfed", "#174579"],
    ["dark placeholder", "#c9d7e9", "#174579"],
    ["navy on gold CTA", "#08295f", "#f9c449"],
    ["white on navy CTA", "#ffffff", "#08295f"],
    ["light danger", "#a12c3b", "#ffffff"],
    ["dark danger", "#ffb4bf", "#10386f"],
  ])("%s has at least 4.5:1 contrast", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("is loaded after legacy CSS and includes Rider, Driver and portals", () => {
    expect(layout).toContain('import "./biloo-contrast-system.css";');
    expect(layout.indexOf('import "./biloo-menu-refinement.css";'))
      .toBeLessThan(layout.indexOf('import "./biloo-contrast-system.css";'));
    expect(css).toContain('.rider-map-flow.nr-polished-wrapper');
    expect(css).toContain('.nr-rider-home-intro h2');
    expect(css).toContain('.nr-driver-app-shell[data-theme]');
    expect(css).toContain('.nr-rider-drawer-layer,.nr-driver-menu-layer');
    expect(css).toContain('.nr-support-page,.nr-safety-page');
    expect(css).toContain('.nex-manage[data-theme]');
    expect(css).toContain('.admin-app[data-theme="dark"]');
  });

  it("does not modify map tiles or operation-specific action colors", () => {
    expect(css).not.toMatch(/(?:mapboxgl-canvas|leaflet-tile)/);
    expect(css).toContain("var(--trip-surface,var(--biloo-contrast-surface))");
    expect(css).toContain("var(--biloo-contrast-status-danger)");
    expect(css).not.toContain(".nr-request-accept");
    expect(css).not.toContain(".nr-nav-stage-primary");
  });
});

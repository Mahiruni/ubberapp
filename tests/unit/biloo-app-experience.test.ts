import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Biloo in-app visual system", () => {
  const css = read("app/biloo-app-experience.css");
  const layout = read("app/layout.tsx");

  it("mounts one shared visual layer after official Biloo brand tokens", () => {
    const brandIndex = layout.indexOf('import "./biloo-brand-system.css";');
    const experienceIndex = layout.indexOf('import "./biloo-app-experience.css";');
    expect(brandIndex).toBeGreaterThan(-1);
    expect(experienceIndex).toBeGreaterThan(brandIndex);
  });

  it("covers the Rider and Driver shells without replacing their operational maps", () => {
    expect(css).toContain('.nr-app[data-mode="rider"]');
    expect(css).toContain(".nr-driver-app-shell");
    expect(css).toContain(".nr-rider-drawer-layer");
    expect(css).toContain(".nr-driver-menu-layer");
    expect(css).not.toMatch(/\.mapboxgl-map\s*\{/);
    expect(css).not.toMatch(/\.leaflet-container\s*\{/);
  });

  it("preserves readable focus, reduced motion and semantic ride states", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("--biloo-ease-out");
    expect(css).toContain("green is verified success/online");
  });
});

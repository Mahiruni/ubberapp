import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Biloo navigation and image-performance safeguards", () => {
  it("never stores personalized navigation HTML in the PWA cache", () => {
    const sw = read("../../public/sw.js");
    const navigation = sw.split('if (request.mode === "navigate") {')[1]?.split("const cacheable =")[0];
    expect(navigation).toBeDefined();
    expect(navigation).not.toContain("cache.put(");
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
  });

  it("keeps the approved welcome images high-priority and lightweight", () => {
    const rider = read("../../app/rider/page.tsx");
    const driver = read("../../app/driver/page.tsx");
    expect(rider).toContain('src="/brand/biloo-rider-get-started.jpg"');
    expect(driver).toContain('src="/brand/biloo-driver-get-started.webp"');
    expect(rider).toContain('fetchPriority="high"');
    expect(driver).toContain('fetchPriority="high"');
  });

  it("does not use full document navigation in Rider tab handlers", () => {
    const root = read("../../app/page.tsx");
    const drawer = read("../../components/nexride/rider-menu.tsx");
    expect(root).not.toContain("window.location.assign(");
    expect(drawer).not.toContain("window.location.assign(");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const map = read("components/nexride/rider-map.tsx");
const rider = read("app/page.tsx");
const driver = read("components/nexride/driver.tsx");
const styles = read("app/live-location.css");

describe("Biloo live device markers", () => {
  it("renders one original black human symbol for Rider and a black car for Driver", () => {
    const start = map.indexOf("const locationMarkerElement = ");
    const end = map.indexOf("const searchAreaElement = ", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const marker = map.slice(start, end);
    expect(marker).toContain('role === "rider"');
    expect(marker).toContain('data'); // marker role attributes are set on the DOM node
    expect(marker).toContain("root.dataset.markerRole = role");
    expect(marker).toContain('fill="#111111"');
    expect(marker.match(/<svg /g)).toHaveLength(2);
    expect(marker).toContain('setAttribute("role", "img")');
    expect(marker).toContain('setAttribute("aria-label", label)');
    expect(marker).not.toContain("nr-live-location-dot");
    expect(marker).not.toContain("nr-live-location-pulse");
  });

  it("uses the person on Rider maps and the vehicle on both Driver maps", () => {
    expect(map).toContain('markerRole = "rider"');
    expect(map).toContain("markerRole?: BilooLocationMarkerRole");
    expect(rider.match(/markerRole=\{mode === "driver" \? "driver" : "rider"\}/g)).toHaveLength(2);
    expect(driver.match(/markerRole="driver"/g)).toHaveLength(2);
  });

  it("replaces rather than duplicates the marker when switching application role", () => {
    expect(map).toContain("if (liveMarkerRole.current !== markerRole)");
    expect(map).toContain("liveMarker.current?.remove()");
    expect(map).toContain("liveMarkerRole.current = markerRole");
    expect(map).toContain("liveMarkerRole.current = null");
    expect(map).toContain("markerRole,");
  });

  it("eliminates the green accuracy-circle display and new-marker pulses", () => {
    expect(map).toContain('"fill-opacity": 0');
    expect(map).toContain('"line-opacity": 0');
    expect(styles).toContain(".nr-live-location-marker.nr-location-identity");
    expect(styles).toContain(".nr-location-identity-glyph");
    expect(styles).toContain('data-marker-role="driver"');
    expect(styles).toContain("border-radius:0!important");
    expect(styles).toContain("background:transparent!important");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_AVATAR, mapAvatarSvg } from "../../lib/biloo-rider-avatar-art";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const map = read("components/nexride/rider-map.tsx");
const rider = read("app/page.tsx");
const driver = read("components/nexride/driver.tsx");
const styles = read("app/live-location.css");

describe("Biloo live device markers", () => {
  it("renders the selected Rider character or the registered Biloo Driver car", () => {
    const start = map.indexOf("const locationMarkerElement = ");
    const end = map.indexOf("const searchAreaElement = ", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const marker = map.slice(start, end);
    expect(marker).toContain('role === "rider"');
    expect(marker).toContain('data'); // marker role attributes are set on the DOM node
    expect(marker).toContain("root.dataset.markerRole = role");
    expect(marker).toContain('if (role === "driver") updateDriverCarMarker(root, driverAvatar)');
    expect(marker).toContain("mapAvatarSvg(avatar, 'map', true)");
    expect(marker).not.toContain('<svg ');
    expect(mapAvatarSvg({ ...DEFAULT_MAP_AVATAR, preset: 19 })).toContain('character-20-v2.webp');
    expect(marker).toContain('setAttribute("role", "img")');
    expect(marker).toContain('setAttribute("aria-label", label)');
    expect(marker).not.toContain("nr-live-location-dot");
    expect(marker).not.toContain("nr-live-location-pulse");
  });

  it("uses the person on Rider maps and the vehicle on both Driver maps", () => {
    expect(map).toContain('markerRole = "rider"');
    expect(map).toContain("markerRole?: BilooLocationMarkerRole");
    expect(rider.match(/markerRole="rider"/g)).toHaveLength(1);
    expect(rider.match(/markerRole=\{mode === "driver" \? "driver" : "rider"\}/g)).toHaveLength(1);
    expect(driver.match(/markerRole="driver"/g)).toHaveLength(2);
  });

  it("replaces rather than duplicates the marker when switching application role", () => {
    expect(map).toContain("if (liveMarkerRole.current !== markerRole)");
    expect(map).toContain("liveMarker.current?.remove()");
    expect(map).toContain("liveMarkerRole.current = markerRole");
    expect(map).toContain("liveMarkerRole.current = null");
    expect(map).toContain("markerRole,");
  });

  it("keeps Mapbox accuracy fill hidden and preserves transparent marker backgrounds", () => {
    expect(map).toContain('"fill-opacity": 0');
    expect(map).toContain('"line-opacity": 0');
    expect(styles).toContain(".nr-live-location-marker.nr-location-identity");
    expect(styles).toContain(".nr-location-identity-glyph");
    expect(styles).toContain('data-marker-role="driver"');
    expect(styles).toContain("border-radius:0!important");
    expect(styles).toContain("background:transparent!important");
  });

  it("keeps Rider art compact and anchored at its feet without an expanding halo", () => {
    const avatarStyles = styles.slice(styles.indexOf("/* Override both legacy"));
    expect(avatarStyles).toContain('width:36px!important;height:48px!important');
    expect(avatarStyles).toContain('width:20px;height:6px');
    expect(avatarStyles).toContain('animation:none!important');
    expect(avatarStyles).not.toContain('scale(2.55)');
    expect(map).toContain('anchor: markerRole === "rider" ? RIDER_MAP_AVATAR_SIZE.anchor : "center"');
  });

  it("isolates Rider styling and dims stale Rider artwork", () => {
    const avatarStyles = styles.slice(styles.indexOf("/* Override both legacy"));
    expect(avatarStyles).not.toContain('[data-marker-role="driver"]');
    expect(avatarStyles).toContain('.is-stale>.biloo-rider-avatar-art');
    expect(avatarStyles).toContain('opacity:.57');
    expect(avatarStyles).toContain('animation:none!important');
    expect(styles).toContain('[data-marker-role="driver"] .nr-location-identity-glyph');
  });
});

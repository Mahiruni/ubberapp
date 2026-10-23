import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("Biloo automatic map location", () => {
  const location = source("lib/nexride-location.ts");
  const map = source("components/nexride/rider-map.tsx");
  const rider = source("app/page.tsx");
  const driver = source("components/nexride/driver.tsx");

  it("automatically starts a real GPS watch for both roles on page open", () => {
    expect(location).toContain("startWatch(false);\n\n    const syncPermission");
    expect(location).toContain("navigator.geolocation.watchPosition(");
    expect(location).toContain('setStatus("loading")');
    expect(location).toContain('setStatus("denied")');
    expect(location).toContain('setStatus("unavailable")');
    expect(location).toContain("validLocation(result.coords)");
    expect(rider).toContain("const riderLocation = useRiderLocation()");
    expect(driver).toContain("const mapLocation = useRiderLocation()");
    expect(rider).toContain("position={riderLocation.position}");
    expect(driver).toContain("position={mapLocation.position}");
    expect(location).not.toContain("localStorage.setItem");
  });

  it("centers immediately on a valid GPS fix, not an assumed city", () => {
    expect(map).toContain("positionRef.current && statusRef.current === \"ready\"");
    expect(map).toContain("center: [positionRef.current.lng, positionRef.current.lat]");
    expect(map).toContain("const target: [number, number] = [position.lng, position.lat]");
    expect(map).toContain("currentMap.easeTo({");
    expect(map).toContain("center: target,");
    expect(map).toContain("Math.max(currentMap.getZoom(), 16)");
  });

  it("never overrides manual pans or a planned trip unless recenter is tapped", () => {
    expect(map).toContain('map.on("dragstart", markManual)');
    expect(map).toContain('map.on("zoomstart", markManual)');
    expect(map).toContain('map.on("rotatestart", markManual)');
    expect(map).toContain("if (recenterChanged) manualView.current = false");
    expect(map).toContain("const plannedRoute = Boolean(");
    expect(map).toContain("if (!manualView.current && (!plannedRoute || recenterChanged))");
    expect(map).not.toContain("if (isNew || recenterChanged) manualView.current = false");
  });

  it("preserves Driver online/offline controls and provides GPS recovery", () => {
    expect(driver).toContain('screen === "map"');
    expect(driver).toContain("Finding your location automatically");
    expect(driver).toContain("GPS unavailable. Check device location");
    expect(driver).toContain("nr-driver-availability-swipe");
    expect(map).toContain('status === "denied"');
    expect(map).toContain('onClick={locate}');
    expect(map).toContain('aria-label={t("recenter")}');
  });
});

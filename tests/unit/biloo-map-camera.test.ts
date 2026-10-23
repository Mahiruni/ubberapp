import { describe, expect, it } from "vitest";
import { riderHomeLocationCameraOffset } from "../../lib/biloo-map-camera";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const map = readFileSync(join(process.cwd(), "components/nexride/rider-map.tsx"), "utf8");

describe("Biloo Rider default location camera framing", () => {
  it("raises GPS into the clear center of the map above the 40% home sheet", () => {
    expect(riderHomeLocationCameraOffset(920, true, true)).toEqual([0, -101]);
    expect(riderHomeLocationCameraOffset(700, true, true)).toEqual([0, -77]);
    expect(riderHomeLocationCameraOffset(400, true, true)).toEqual([0, -44]);
    expect(riderHomeLocationCameraOffset(2000, true, true)).toEqual([0, -150]);
  });

  it("never offsets Driver, other Rider stages, desktop or invalid viewports", () => {
    expect(riderHomeLocationCameraOffset(920, false, true)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(920, true, false)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(170, true, true)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(0, true, true)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(Number.NaN, true, true)).toEqual([0, 0]);
  });

  it("applies same offset on first render, initial load, GPS updates, manual recenter and resize", () => {
    expect(map).toContain("function deviceLocationCameraOffset(map: MapboxMap)");
    expect(map).toContain("riderHomeLocationCameraOffset(");
    expect(map.match(/offset: deviceLocationCameraOffset\(/g)).toHaveLength(5);
    expect(map).toContain('container.current?.closest(".rider-home-view")');
    expect(map).toContain("!manualView.current && !planned");
    expect(map).toContain("if (!manualView.current && (!plannedRoute || recenterChanged))");
    expect(map).toContain('map.on("dragstart", markManual)');
    expect(map).toContain("fitJourney(map, journeyRef.current, rideLabelRef.current)");
  });
});

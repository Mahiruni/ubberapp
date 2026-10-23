import { describe, expect, it } from "vitest";
import { riderHomeLocationCameraOffset } from "../../lib/biloo-map-camera";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const map = readFileSync(join(process.cwd(), "components/nexride/rider-map.tsx"), "utf8");

describe("Biloo Rider default location camera framing", () => {
  it("centers GPS at the visible map midpoint when the wrapper uses a separate row", () => {
    expect(riderHomeLocationCameraOffset(920, true, true)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(700, true, true, 0)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(400, true, true, 0)).toEqual([0, 0]);
  });

  it("compensates for a wrapper that overlays the bottom portion of the map", () => {
    expect(riderHomeLocationCameraOffset(920, true, true, 320)).toEqual([0, -160]);
    expect(riderHomeLocationCameraOffset(700, true, true, 250)).toEqual([0, -125]);
    expect(riderHomeLocationCameraOffset(400, true, true, 100)).toEqual([0, -50]);
    expect(riderHomeLocationCameraOffset(200, true, true, 1000)).toEqual([0, -50]);
  });

  it("never applies Rider home offset to Driver, desktop, other Rider stages or invalid inputs", () => {
    expect(riderHomeLocationCameraOffset(920, false, true, 400)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(920, true, false, 400)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(120, true, true, 50)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(0, true, true, 50)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(Number.NaN, true, true, 50)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(900, true, true, Number.NaN)).toEqual([0, 0]);
    expect(riderHomeLocationCameraOffset(900, true, true, -100)).toEqual([0, 0]);
  });

  it("uses the same geometry-aware camera policy on start, GPS updates, recenter and resizing", () => {
    expect(map).toContain("function deviceLocationCameraOffset(map: MapboxMap)");
    expect(map).toContain("riderHomeLocationCameraOffset(");
    expect(map).toContain("getBoundingClientRect()");
    expect(map).toContain('home.querySelector<HTMLElement>(".nr-home-panel-host")');
    expect(map).toContain("occludedBottomPx");
    expect(map.match(/offset: deviceLocationCameraOffset\(/g)).toHaveLength(5);
    expect(map).toContain("!manualView.current && !planned");
    expect(map).toContain("if (!manualView.current && (!plannedRoute || recenterChanged))");
    expect(map).toContain('map.on("dragstart", markManual)');
    expect(map).toContain("fitJourney(map, journeyRef.current, rideLabelRef.current)");
  });
});

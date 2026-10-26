import { describe, expect, it } from "vitest";
import { riderHomeLocationCameraOffset, riderTripMapPadding } from "../../lib/biloo-map-camera";
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

  it("frames a floating card, dock and safe header inside the visible map", () => {
    const [x, y] = riderHomeLocationCameraOffset(844, true, true, 306, 116);
    expect(x).toBe(0);
    // The projected point is the midpoint between the header and card.
    expect(844 / 2 + y).toBe((116 + 538) / 2);
    expect(riderHomeLocationCameraOffset(844, true, true, 650, 116)).toEqual([0, -278]);
    expect(riderHomeLocationCameraOffset(844, true, true, 306, Number.NaN)).toEqual([0, -153]);
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
    expect(map.match(/padding: deviceLocationCameraPadding\(/g)).toHaveLength(5);
    expect(map.match(/retainPadding: false/g)).toHaveLength(5);
    expect(map).not.toContain("offset: deviceLocationCameraOffset(");
    expect(map).toContain("!manualView.current && !planned");
    expect(map).toContain("if (!manualView.current && (!plannedRoute || recenterChanged))");
    expect(map).toContain('map.on("dragstart", markManual)');
    expect(map).toContain("fitJourney(map, journeyRef.current, rideLabelRef.current)");
  });
});

describe('Active Rider trip map clearance', () => {
  const clear = { top: 0, right: 0, bottom: 0, left: 0 };
  it('clears the measured header/card and preserves the entire person above endpoints', () => {
    expect(riderTripMapPadding(390, 370, { ...clear, top: 128, right: 60 })).toEqual({ top: 184, right: 84, bottom: 28, left: 24 });
    expect(riderTripMapPadding(390, 246, { ...clear, top: 58 })).toEqual({ top: 114, right: 72, bottom: 28, left: 24 });
  });
  it('handles a bottom wrapper or a desktop side panel without moving coordinates', () => {
    expect(riderTripMapPadding(390, 844, { ...clear, top: 128, bottom: 440 }).bottom).toBe(460);
    expect(riderTripMapPadding(1280, 800, { ...clear, left: 400 }).left).toBe(424);
    expect(riderTripMapPadding(1280, 800, { ...clear, right: 400 }).right).toBe(424);
  });
  it('always leaves Mapbox a positive fitting rectangle on small or malformed layouts', () => {
    for (const [width,height] of [[320,140],[390,246],[40,40],[0,0],[NaN,Infinity]]) {
      const padding = riderTripMapPadding(width,height,{top:800,bottom:800,left:800,right:800});
      expect(Object.values(padding).every(value=>Number.isFinite(value)&&value>=0)).toBe(true);
      expect(padding.top+padding.bottom).toBeLessThan(Math.max(16,Number.isFinite(height)?height:0));
      expect(padding.left+padding.right).toBeLessThan(Math.max(16,Number.isFinite(width)?width:0));
    }
  });
});

import { describe, expect, it } from "vitest";
import { sheetHeight, nearestSheetRatio, projectedSheetHeight } from "../../lib/nexride-sheet-geometry";

describe("sheet geometry", () => {
  it("keeps every snap inside short, mobile and desktop visible viewports", () => {
    for (const viewport of [140, 260, 375, 844, 1080]) {
      for (const ratio of [0.28, 0.5, 0.82]) {
        expect(sheetHeight(ratio, viewport)).toBeGreaterThan(0);
        expect(sheetHeight(ratio, viewport)).toBeLessThanOrEqual(viewport - 72);
      }
    }
  });
  it("uses the physical snap heights when the keyboard shrinks the viewport", () => {
    expect(nearestSheetRatio(205, 300, [0.28, 0.5, 0.78])).toBe(0.78);
    expect(nearestSheetRatio(420, 844, [0.28, 0.5, 0.78])).toBe(0.5);
  });
  it("drops stale flick momentum after a pause and caps fast flicks", () => {
    expect(projectedSheetHeight(400, 5, 100)).toBe(400);
    expect(projectedSheetHeight(400, 5, 10)).toBe(560);
    expect(projectedSheetHeight(400, -5, 10)).toBe(240);
  });
});

import { describe, expect, it } from "vitest";
import { cycleDriverDockSnap, snapDriverDockFromDrag } from "../../lib/nexride-driver-dock";

describe("persistent Driver dock", () => {
  it("only changes state on an intentional handle cycle", () => {
    expect(cycleDriverDockSnap("compact")).toBe("expanded");
    expect(cycleDriverDockSnap("expanded")).toBe("minimal");
    expect(cycleDriverDockSnap("minimal")).toBe("compact");
  });
  it("ignores tiny pointer movement (normal button presses do not hide the dock)", () => {
    expect(snapDriverDockFromDrag("compact", 12)).toBe("compact");
    expect(snapDriverDockFromDrag("expanded", -5)).toBe("expanded");
    expect(snapDriverDockFromDrag("minimal", Number.NaN)).toBe("minimal");
  });
  it("supports deliberate up/down gestures without disappearing", () => {
    expect(snapDriverDockFromDrag("minimal", -60)).toBe("compact");
    expect(snapDriverDockFromDrag("compact", -50)).toBe("expanded");
    expect(snapDriverDockFromDrag("expanded", 80)).toBe("compact");
    expect(snapDriverDockFromDrag("compact", 90)).toBe("minimal");
  });
});

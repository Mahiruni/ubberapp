import { describe, expect, it } from "vitest";
import {
  DRIVER_SWIPE_CONFIRM_FRACTION,
  clampSwipeOffset,
  isSwipeReleaseReady,
  isSwipeThumbHit,
  swipeTrackTravel,
} from "../../lib/nexride-driver-swipe";

describe("Driver availability thumb tracking", () => {
  it("measures travel from real track and thumb dimensions", () => {
    expect(swipeTrackTravel(360, 52)).toBe(300);
    expect(swipeTrackTravel(60, 52)).toBe(0);
    expect(swipeTrackTravel(Number.NaN, 52)).toBe(0);
  });

  it("clamps thumb movement to available travel", () => {
    expect(clampSwipeOffset(-100, 300)).toBe(0);
    expect(clampSwipeOffset(140, 300)).toBe(140);
    expect(clampSwipeOffset(350, 300)).toBe(300);
    expect(clampSwipeOffset(Number.NaN, 300)).toBe(0);
  });

  it("only begins a drag near the circular thumb", () => {
    expect(isSwipeThumbHit(32, 4, 52)).toBe(true);
    expect(isSwipeThumbHit(305, 4, 52)).toBe(false);
    expect(isSwipeThumbHit(300, 304, 52)).toBe(true);
  });

  it("ignores taps and incomplete drags in both directions", () => {
    expect(DRIVER_SWIPE_CONFIRM_FRACTION).toBe(0.72);
    expect(isSwipeReleaseReady(false, 300, 300, false)).toBe(false);
    expect(isSwipeReleaseReady(false, 120, 300, true)).toBe(false);
    expect(isSwipeReleaseReady(true, 300, 300, true)).toBe(false);
    expect(isSwipeReleaseReady(true, 230, 300, true)).toBe(false);
  });

  it("accepts deliberate directional swipes beyond 72 percent", () => {
    expect(isSwipeReleaseReady(false, 216, 300, true)).toBe(true);
    expect(isSwipeReleaseReady(true, 84, 300, true)).toBe(true);
    expect(isSwipeReleaseReady(true, 0, 300, true)).toBe(true);
    expect(isSwipeReleaseReady(false, 0, 0, true)).toBe(false);
  });
});

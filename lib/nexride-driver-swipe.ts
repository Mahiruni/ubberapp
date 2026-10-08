/** Pure geometry for NexRide's confirmation-only Driver availability slider. */
export const DRIVER_SWIPE_CONFIRM_FRACTION = 0.72;

export function clampSwipeOffset(position: number, max: number): number {
  if (!Number.isFinite(position)) return 0;
  return Math.max(0, Math.min(Math.max(0, max), position));
}

export function swipeTrackTravel(trackWidth: number, thumbWidth: number): number {
  if (!Number.isFinite(trackWidth) || !Number.isFinite(thumbWidth)) return 0;
  return Math.max(0, trackWidth - thumbWidth - 8);
}

export function isSwipeThumbHit(pointerX: number, thumbLeft: number, thumbWidth: number): boolean {
  return pointerX >= thumbLeft - 8 && pointerX <= thumbLeft + thumbWidth + 8;
}

export function isSwipeReleaseReady(online: boolean, offset: number, max: number, moved: boolean): boolean {
  if (!moved || max <= 0) return false;
  const fraction = clampSwipeOffset(offset, max) / max;
  return online ? fraction <= 1 - DRIVER_SWIPE_CONFIRM_FRACTION : fraction >= DRIVER_SWIPE_CONFIRM_FRACTION;
}

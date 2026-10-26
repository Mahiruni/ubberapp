/**
 * Framing the LIVE location on Biloo Rider's default map.
 *
 * The target is the midpoint of the actual visible map area ABOVE the
 * bottom "Where to?" wrapper, not the midpoint of the whole app viewport.
 *
 * When the sheet occupies a separate grid row, nothing occludes the map
 * and the correct Mapbox pixel offset is [0, 0]. If a wrapper overlays the
 * map (e.g. during a responsive transition), offset by half the portion it
 * covers so the GPS marker still sits in the clear map's center.
 *
 * This camera policy never changes Driver maps, other trip screens, desktop,
 * the actual GPS coordinates, or the navigation route.
 */
export function riderHomeLocationCameraOffset(
  mapHeight: number,
  riderHome: boolean,
  mobile: boolean,
  occludedBottomPx = 0,
  occludedTopPx = 0,
): [number, number] {
  if (
    !riderHome ||
    !mobile ||
    !Number.isFinite(mapHeight) ||
    mapHeight < 140
  ) {
    return [0, 0];
  }

  const covered = Number.isFinite(occludedBottomPx)
    ? Math.max(0, Math.min(mapHeight - 100, occludedBottomPx))
    : 0;

  // Frame the real point halfway between the floating header and lower card.
  // Bottom chrome moves it up; top chrome moves it down.
  const top = Number.isFinite(occludedTopPx)
    ? Math.max(0, Math.min(mapHeight - covered - 100, occludedTopPx)) : 0;
  return [0, Math.round((top - covered) / 2)];
}

/** Active-trip camera clearance is measured from visible chrome, not the GPS.
 * Preserve the full 48px person and room for the car/label at either endpoint.
 * Even a nearly expanded sheet must leave Mapbox a positive fitting rectangle.
 */
export function riderTripMapPadding(width: number, height: number, occlusion: {
  top: number; bottom: number; left: number; right: number;
}) {
  const safe = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const w = Math.max(16, safe(width)), h = Math.max(16, safe(height));
  const right = Math.min(Math.max(72, safe(occlusion.right) + 24), Math.max(0, w - 32));
  const left = Math.min(Math.max(24, safe(occlusion.left) + 24), Math.max(0, w - right - 8));
  const bottom = Math.min(Math.max(28, safe(occlusion.bottom) + 20), Math.max(0, h - 64));
  const top = Math.min(Math.max(64, safe(occlusion.top) + 56), Math.max(0, h - bottom - 8));
  return { top, right, bottom, left };
}

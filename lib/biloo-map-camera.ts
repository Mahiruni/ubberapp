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

  // A negative Mapbox pixel offset places the actual GPS point higher
  // on-screen, at 50% of the unobstructed portion of the map.
  return [0, covered > 0 ? -Math.round(covered / 2) : 0];
}

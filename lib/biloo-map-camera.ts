/**
 * GPS camera framing for the default Biloo Rider home screen.
 *
 * The home sheet lives in a separate grid row below the map. The default
 * location should sit in the central CLEAR area of the map, comfortably away
 * from the sheet, rather than being centered under the bottom controls.
 *
 * A negative Mapbox camera offset raises the position on screen. This policy
 * intentionally has no effect on Driver maps, other trip stages or desktop.
 */
export function riderHomeLocationCameraOffset(
  visibleMapHeight: number,
  riderHome: boolean,
  mobile: boolean,
): [number, number] {
  if (
    !riderHome ||
    !mobile ||
    !Number.isFinite(visibleMapHeight) ||
    visibleMapHeight < 180
  ) {
    return [0, 0];
  }
  // 11% above the physical canvas midpoint ≈ 39% from the top.
  return [0, -Math.round(Math.min(150, visibleMapHeight * 0.11))];
}

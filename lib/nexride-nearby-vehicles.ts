/** Show online, eligible NexRide drivers only within 1 km of the rider. */
export const NEARBY_DRIVER_RADIUS_METERS = 1_000;
export function withinNearbyDriverRadius(distanceMeters: number) {
  return Number.isFinite(distanceMeters) && distanceMeters >= 0 &&
    distanceMeters <= NEARBY_DRIVER_RADIUS_METERS;
}

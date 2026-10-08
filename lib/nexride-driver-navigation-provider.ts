/** Driver-selected external turn-by-turn navigation provider.
 * Only the external handoff changes; NexRide Mapbox trip routing is preserved.
 */
export const NEXRIDE_DRIVER_NAV_PROVIDER_KEY = "nexride.driver.navigation.provider";

export type NexRideDriverNavigationProvider = "google" | "waze";

export function isDriverNavigationProvider(value: unknown): value is NexRideDriverNavigationProvider {
  return value === "google" || value === "waze";
}

export function readDriverNavigationProvider(): NexRideDriverNavigationProvider {
  if (typeof window === "undefined") return "google";
  try {
    const saved = window.localStorage.getItem(NEXRIDE_DRIVER_NAV_PROVIDER_KEY);
    return isDriverNavigationProvider(saved) ? saved : "google";
  } catch {
    return "google";
  }
}

export function driverExternalNavigationUrl(
  target: { lat: number; lng: number } | null,
  label: string,
  provider: NexRideDriverNavigationProvider,
): string {
  if (provider === "waze" && target && Number.isFinite(target.lat) && Number.isFinite(target.lng)) {
    return `https://www.waze.com/ul?ll=${encodeURIComponent(`${target.lat},${target.lng}`)}&navigate=yes`;
  }
  const destination = target && Number.isFinite(target.lat) && Number.isFinite(target.lng)
    ? `${target.lat},${target.lng}`
    : label;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate`;
}

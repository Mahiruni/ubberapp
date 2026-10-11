/** Strict, first-party navigation for untrusted FCM data payloads. */
const offerId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function nexridePushDestination(
  data: Record<string, unknown> | null | undefined,
  nativeRole: "rider" | "driver" | null,
  now = Date.now(),
): string | null {
  if (!data || !nativeRole) return null;
  if (nativeRole === "rider") {
    return data.url === "/rider/trips" ? "/rider/trips" : null;
  }
  if (data.url === "/driver/home") return "/driver/home";
  if (typeof data.url !== "string") return null;
  const match = /^\/driver\/request\?offer=([0-9a-f-]{36})$/i.exec(data.url);
  if (!match || !offerId.test(match[1])) return null;
  // Stale Android tray notifications should never reopen an expired offer.
  // Driver request page additionally verifies live database status and
  // prevents acceptance of already-expired or withdrawn offers.
  if (typeof data.expiresAt === "string") {
    const expiry = Date.parse(data.expiresAt);
    if (!Number.isFinite(expiry) || expiry <= now) return "/driver/activity";
  }
  return data.url;
}

/** Avoid handing Google Play Services an FCM TTL longer than the live offer. */
export function nexrideDriverOfferTtlSeconds(expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return 0;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return 0;
  const seconds = Math.floor((expiry - now) / 1000);
  return seconds > 2 ? Math.min(25, seconds) : 0;
}

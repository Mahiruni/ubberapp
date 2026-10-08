export type DriverOfferStatus = { id: string; status: string; expires_at?: string | null };
export function eligibleDriverOffer(offer: DriverOfferStatus, now = Date.now()): boolean {
  if (!offer.id || offer.status !== "pending") return false;
  if (!offer.expires_at) return true;
  const expiry = Date.parse(offer.expires_at);
  return Number.isFinite(expiry) && expiry > now;
}
export function shouldOpenDriverOffer(path: string, visibility: string): boolean {
  if (visibility !== "visible") return false;
  return !["/driver/request", "/driver/navigation", "/driver/pickup"].some(prefix =>
    path.startsWith(prefix));
}

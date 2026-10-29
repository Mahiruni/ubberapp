/** Versioned native protocol: older APKs keep their existing system notification. */
export const BILOO_DRIVER_ALERT_PROTOCOL = 1;
type Offer = { id: string; driver_id: string; request_id?: string; expires_at: string | null; created_at?: string; pickup_distance_km?: number | null; pickup_eta_minutes?: number | null };
type Ride = { pickup_location?: string; estimated_driver_payout_etb?: number | null; estimated_trip_fare_etb?: number | null };
const text = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\r\n\t]/g, ' ').trim().slice(0, max) : '';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function nativeDriverAlertData(event: { kind: 'driver_offer' | 'driver_offer_closed'; id: string; user_id: string; offer_id: string; created_at?: string }, offer: Offer | null, ride: Ride | null, now = Date.now()): Record<string, string> {
  const data: Record<string, string> = {
    alertProtocol: String(BILOO_DRIVER_ALERT_PROTOCOL), kind: event.kind,
    eventId: event.id, offerId: event.offer_id, userId: event.user_id,
    issuedAtMs: String(Date.parse(offer?.created_at || event.created_at || '') || now),
  };
  if (event.kind === 'driver_offer_closed') return data;
  const end = Date.parse(offer?.expires_at || '');
  if (!offer || !Number.isFinite(end) || end <= now || offer.driver_id !== event.user_id) throw new Error('invalid_native_offer');
  data.expiresAt = new Date(end).toISOString(); data.expiresAtMs = String(end);
  data.url = '/driver/request?offer=' + event.offer_id;
  data.pickup = text(ride?.pickup_location, 120);
  const detail: string[] = [];
  if (positive(offer.pickup_distance_km)) detail.push(`${Number(offer.pickup_distance_km.toFixed(1))} km`);
  if (positive(offer.pickup_eta_minutes)) detail.push(`${Math.round(offer.pickup_eta_minutes)} min`);
  if (positive(ride?.estimated_driver_payout_etb)) detail.push(`ETB ${Math.round(ride.estimated_driver_payout_etb)}`);
  data.detail = detail.join(' · ');
  return data;
}

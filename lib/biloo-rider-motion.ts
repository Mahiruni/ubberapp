/** Cosmetic poses only. Never use these calculations to change map coordinates. */
export type RiderPose = 'idle' | 'walk' | 'jog' | 'wave';
export type RiderMotionFix = {
  lat: number; lng: number; accuracy: number; timestamp: number; speed?: number | null;
};
export const RIDER_WAVE_MS = 6000;
export const PICKUP_SIGNAL_TTL_MS = 90_000;
export const PICKUP_SIGNAL_COOLDOWN_MS = 20_000;
export const PICKUP_SIGNAL_MESSAGE = "I'm here at pickup. 👋";

export function freshPickupSignal(createdAt: unknown, now = Date.now()): boolean {
  const time = typeof createdAt === 'string' ? Date.parse(createdAt) : Number.NaN;
  return Number.isFinite(time) && time <= now + 5000 && now - time < PICKUP_SIGNAL_TTL_MS;
}

/** Prefer device speed; otherwise require displacement greater than GPS uncertainty. */
export function riderLocomotion(previous: RiderMotionFix | null, next: RiderMotionFix | null, now = Date.now()): Exclude<RiderPose, 'wave'> {
  if (!next || ![next.lat, next.lng, next.accuracy, next.timestamp].every(Number.isFinite) ||
    Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180 || next.accuracy < 0 || next.accuracy > 25 ||
    next.timestamp > now + 5000 || now - next.timestamp > 10_000) return 'idle';
  if (previous && next.timestamp <= previous.timestamp) return 'idle';
  let speed = next.speed;
  if (speed == null || !Number.isFinite(speed) || speed < 0) {
    if (!previous || ![previous.lat, previous.lng, previous.accuracy, previous.timestamp].every(Number.isFinite) || previous.accuracy < 0 || previous.accuracy > 25) return 'idle';
    const seconds = (next.timestamp - previous.timestamp) / 1000;
    if (seconds < 1 || seconds > 15) return 'idle';
    const rad = Math.PI / 180;
    const a = Math.sin((next.lat - previous.lat) * rad / 2) ** 2 +
      Math.cos(previous.lat * rad) * Math.cos(next.lat * rad) * Math.sin((next.lng - previous.lng) * rad / 2) ** 2;
    const meters = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
    if (meters < Math.max(3, (previous.accuracy + next.accuracy) * .65)) return 'idle';
    speed = meters / seconds;
  }
  // Motor traffic and implausible GPS jumps must never become running people.
  if (speed > 6 || speed < .65) return 'idle';
  return speed >= 2.4 ? 'jog' : 'walk';
}

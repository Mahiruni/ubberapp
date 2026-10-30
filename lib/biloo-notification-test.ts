export const notificationTestSettingsUrl = "/driver/profile/settings";
export const notificationTestDelayMs = 5_000;
export type NotificationTestStatus = "queued" | "accepted_by_fcm" | "not_sent";

/** A delayed device test must never become a stale ride-like alert. */
export function notificationTestTtlSeconds(createdAt?: string, now = Date.now()): number {
  const created = Date.parse(createdAt || "");
  if (!Number.isFinite(created) || created > now) return 0;
  return Math.max(0, Math.min(30, Math.floor((created + 60_000 - now) / 1000)));
}

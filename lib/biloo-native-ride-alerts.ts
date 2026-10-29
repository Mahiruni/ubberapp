'use client';
import {Capacitor, registerPlugin} from '@capacitor/core';
import type { NexRideFeedbackPreferences } from './nexride-feedback';

export type NativeRideAlertStatus = {
  protocol: number; enabled: boolean; registered: boolean; notificationsEnabled: boolean;
  channelEnabled: boolean; headsUpEnabled: boolean; soundEnabled: boolean; vibrationEnabled: boolean;
  active: boolean; received: number; displayed: number; opened: number; lastDisplayedAt: number;
};
export type NativeRideAction = { offerId: string; action: 'open' | 'accept' | 'decline' | 'expired'; expiresAt: number; userId: string };
type Plugin = {
  configure(options: { userId: string; enabled: boolean; sounds: boolean; vibration: boolean; language: string }): Promise<unknown>;
  status(): Promise<NativeRideAlertStatus>;
  present(options: { data: Record<string, string> }): Promise<{ owned: boolean; displayed: boolean }>;
  stop(options: { offerId?: string }): Promise<void>;
  disable(): Promise<void>;
  registered(options: {userId: string}): Promise<void>;
  consumeAction(options: {userId: string}): Promise<Partial<NativeRideAction> & {waitingForUnlock?: boolean}>;
  test(): Promise<{displayed: boolean}>;
  openSettings(options: {section: string}): Promise<void>;
  addListener(event: 'rideAction', listener: () => void): Promise<{remove: () => Promise<void>}>;
};
let cached: Promise<Plugin | null> | undefined;
let user = '';
let operations: Promise<unknown> = Promise.resolve();
function operation<T>(work: (native: Plugin | null) => Promise<T>): Promise<T> {
  const result = operations.catch(() => {}).then(async () => work(await nativeRideAlertsPlugin()));
  operations = result.catch(() => {}); return result;
}
export function nativeRideAlertsAvailable() {
  return typeof window !== 'undefined' && Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BilooDriverRideAlerts');
}
export function nativeRideAlertsPlugin(): Promise<Plugin | null> {
  return cached ??= Promise.resolve(nativeRideAlertsAvailable() ? registerPlugin<Plugin>('BilooDriverRideAlerts') : null);
}
export async function configureNativeRideAlerts(userId: string, enabled: boolean, preferences: NexRideFeedbackPreferences, language = 'en') {
  user = userId;
  await operation(async native => {
    if (native) await native.configure({userId, enabled: enabled && preferences.rideRequests, sounds: preferences.sounds, vibration: preferences.haptics, language});
  });
}
export async function presentNativeRideAlert(offerId: string, expiresAt?: string | null) {
  const owner = user;
  return operation(async native => {
    if (!native) return {owned: false, displayed: false};
    const end = Date.parse(expiresAt || '');
    if (!owner || !Number.isFinite(end) || end <= Date.now()) return {owned: true, displayed: false};
    return native.present({data: {offerId, userId: owner, expiresAtMs: String(end), issuedAtMs: String(Date.now())}})
      .catch(() => ({owned: true, displayed: false}));
  });
}
export async function stopNativeRideAlert(offerId?: string) {
  await operation(async native => { if (native) await native.stop({offerId}).catch(() => {}); });
}
export async function disableNativeRideAlerts() {
  user = ''; pending = null;
  await operation(async native => { if (native) await native.disable().catch(() => {}); });
}
export async function nativeRideAlertStatus() { return (await nativeRideAlertsPlugin())?.status().catch(() => null) ?? null; }
export async function markNativeRideAlertRegistration(userId: string) { await (await nativeRideAlertsPlugin())?.registered({userId}); }
export const NATIVE_RIDE_ACTION_EVENT = 'biloo:native-ride-action';
let pending: NativeRideAction | null = null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Only a native, nonce-validated PendingIntent can populate this command slot. */
export function queueNativeRideAction(value: Partial<NativeRideAction>, userId: string): NativeRideAction | null {
  if (!value.offerId || !uuid.test(value.offerId) || value.userId !== userId ||
      !['open', 'accept', 'decline', 'expired'].includes(value.action || '') ||
      typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt)) return null;
  const command = {...value as NativeRideAction, action: value.expiresAt <= Date.now() ? 'expired' as const : value.action!};
  pending = command; window.dispatchEvent(new Event(NATIVE_RIDE_ACTION_EVENT)); return command;
}
export function takeNativeRideAction(offerId: string, userId: string) {
  if (!pending || pending.offerId !== offerId || pending.userId !== userId) return null;
  const result = pending; pending = null;
  return result.expiresAt > Date.now() ? result : {...result, action: 'expired' as const};
}

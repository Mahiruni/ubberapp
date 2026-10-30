"use client";

import { supabase } from "./supabase";
import { nexrideApiFetch } from "./nexride-api-auth";
import { nativeRideAlertsPlugin, markNativeRideAlertRegistration, disableNativeRideAlerts } from "./biloo-native-ride-alerts";
import type { NotificationTestStatus } from "./biloo-notification-test";

type Role = "rider" | "driver";
export type NativePushReadiness = {
  registered: boolean; permissionGranted: boolean; channelEnabled?: boolean;
  headsUpEnabled?: boolean; soundEnabled?: boolean; vibrationEnabled?: boolean;
  testStatus: NotificationTestStatus | null;
};
type NativeDriverLocation = {
  start(options: { accessToken: string; userId: string }): Promise<{ status: string }>;
  stop(): Promise<void>;
  status(): Promise<NativeDriverGpsStatus>;
  openSettings(): Promise<void>;
};
export type NativeDriverGpsStatus = {
  running: boolean; state?: string; lastFixAt?: number; lastUploadAt?: number;
  batteryExempt?: boolean; locationEnabled?: boolean;
  tripTracking?: boolean;
};

const storageKey = "nexride.native.installation.id";
function installationId(): string {
  const saved = localStorage.getItem(storageKey);
  if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(storageKey, id);
  return id;
}

async function nativeCapacitor() {
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return null;
  return { Capacitor, registerPlugin };
}

/** The native Android package is the authority for push device identity.
 * URL routes and sessionStorage must never decide which APK owns an FCM token.
 */
export async function getNexRideNativeAppRole(): Promise<Role | null> {
  if (!await nativeCapacitor()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const { id } = await App.getInfo();
    if (id === "com.nexride.driver") return "driver";
    if (id === "com.nexride.rider") return "rider";
  } catch { /* Do not register a push token if app identity cannot be verified. */ }
  return null;
}

export async function enableNexRideNativeNotifications(role: Role) {
  if (!await nativeCapacitor()) return "web_only" as const;
  if (await getNexRideNativeAppRole() !== role) return "wrong_app_role" as const;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return "denied" as const;
  await PushNotifications.createChannel({
    // Android notification channel settings are immutable after creation.
    // v2 is intentionally created natively at Driver launch with a custom
    // Biloo chime and a distinct vibration pattern.
    id: role === "driver" ? "nexride_driver_requests_v2" : "nexride_trip_updates",
    name: role === "driver" ? "Incoming ride requests" : "Trip updates",
    description: "Important Biloo ride and trip events",
    importance: role === "driver" ? 5 : 3, vibration: true, visibility: 1,
    ...(role === "driver" ? { sound: "nexride_ride_request.wav" } : {}),
  });
  await PushNotifications.register();
  return "registration_started" as const;
}

export async function reconcileNexRideNativePush(role: Role) {
  if (!await nativeCapacitor() || await getNexRideNativeAppRole() !== role) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") return;
  await PushNotifications.register();
}

/** Works with legacy APKs, without claiming they have the alarm-style plugin. */
export async function nativePushReadiness(role: Role): Promise<NativePushReadiness | null> {
  if (!await nativeCapacitor() || await getNexRideNativeAppRole() !== role) return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const [permission, channels, response] = await Promise.all([
    PushNotifications.checkPermissions(),
    PushNotifications.listChannels().catch(() => ({ channels: [] })),
    nexrideApiFetch("/api/native/devices?" + new URLSearchParams({ role, installationId: installationId() })),
  ]);
  if (!response.ok) return null;
  const data = await response.json() as { registered?: boolean; testStatus?: string };
  const channel = channels.channels.find(value => value.id === (role === "driver" ? "nexride_driver_requests_v2" : "nexride_trip_updates"));
  return {
    registered: data.registered === true, permissionGranted: permission.receive === "granted",
    channelEnabled: channel ? (channel.importance ?? 0) > 0 : undefined,
    headsUpEnabled: channel ? (channel.importance ?? 0) >= 4 : undefined,
    soundEnabled: channel ? !!channel.sound : undefined,
    vibrationEnabled: channel?.vibration,
    testStatus: data.testStatus === "queued" || data.testStatus === "accepted_by_fcm" || data.testStatus === "not_sent" ? data.testStatus : null,
  };
}

export async function sendNativeDriverNotificationTest(): Promise<string> {
  if (!await nativeCapacitor() || await getNexRideNativeAppRole() !== "driver") return "wrong_app_role";
  const response = await nexrideApiFetch("/api/native/notifications/test", {
    method: "POST", body: JSON.stringify({ role: "driver", installationId: installationId() }),
  });
  const result = await response.json() as { status?: string };
  return result.status || "test_unavailable";
}

export async function registerNexRidePushToken(token: string) {
  const { data } = await supabase.auth.getSession();
  const role = await getNexRideNativeAppRole();
  if (!data.session || !role || !token) return;
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "POST", body: JSON.stringify({ role, token, installationId: installationId(),
      alertProtocol: role === "driver" && await nativeRideAlertsPlugin() ? 1 : 0 }),
  });
  if (!result.ok) throw new Error("device_registration_failed");
  if (role === "driver") await markNativeRideAlertRegistration(data.session.user.id).catch(() => {});
  window.dispatchEvent(new CustomEvent("nexride:native-push-status", {
    detail: { status: "registered", role },
  }));
}

export async function unregisterNexRidePushDevice(role: Role) {
  if (!await nativeCapacitor()) return;
  if (role === "driver") await disableNativeRideAlerts();
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "DELETE", body: JSON.stringify({ role, installationId: installationId() }),
  });
  if (!result.ok) throw new Error("device_unregistration_failed");
}

export async function nativeDriverGpsStatus() {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return null;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  return plugin.status().catch(() => null);
}
export async function startNativeDriverGps(): Promise<boolean> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  try {
    const result = await plugin.start({ accessToken: data.session.access_token, userId: data.session.user.id });
    return result.status === "started";
  } catch { return false; }
}

export async function openNativeDriverSettings(): Promise<void> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return;
  await cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation").openSettings();
}
export async function stopNativeDriverGps(): Promise<void> {
  const cap = await nativeCapacitor();
  if (!cap) return;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  await plugin.stop().catch(() => {});
}

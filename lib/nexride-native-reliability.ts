"use client";

import { supabase } from "./supabase";
import { publicConfig } from "./runtime-config";
import { explicitSignOutRole } from "./nexride-startup";
import { nexrideApiFetch } from "./nexride-api-auth";

type Role = "rider" | "driver";
export type NativeDriverGpsSnapshot = {
  running: boolean;
  lastServerAckAt: number;
  lastGpsFixAt: number;
  accuracyMeters: number | null;
  error: string;
};
type NativeDriverLocation = {
  start(options: {
    accessToken: string; refreshToken: string;
    authUrl: string; publishableKey: string;
  }): Promise<{ status: string }>;
  stop(): Promise<void>;
  status(): Promise<NativeDriverGpsSnapshot>;
  session(): Promise<{ accessToken?: string; refreshToken?: string }>;
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
    // NexRide chime and a distinct vibration pattern.
    id: role === "driver" ? "nexride_driver_requests_v2" : "nexride_trip_updates",
    name: role === "driver" ? "Incoming ride requests" : "Trip updates",
    description: "Important NexRide ride and trip events",
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

export async function registerNexRidePushToken(token: string) {
  const { data } = await supabase.auth.getSession();
  const role = await getNexRideNativeAppRole();
  if (!data.session || !role || !token) return;
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "POST", body: JSON.stringify({ role, token, installationId: installationId() }),
  });
  if (!result.ok) throw new Error("device_registration_failed");
  window.dispatchEvent(new CustomEvent("nexride:native-push-status", {
    detail: { status: "registered", role },
  }));
}

export async function unregisterNexRidePushDevice(role: Role) {
  if (!await nativeCapacitor()) return;
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "DELETE", body: JSON.stringify({ role, installationId: installationId() }),
  });
  if (!result.ok) throw new Error("device_unregistration_failed");
}

export async function nativeDriverGpsStatus(): Promise<NativeDriverGpsSnapshot | null> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return null;
  return cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation").status().catch(() => null);
}

/** Reconcile on foreground return: Android may have rotated the Supabase token
 * while the WebView was suspended. Never persist another token store natively.
 */
export async function reconcileNativeDriverGpsSession(): Promise<void> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  const native = await plugin.session().catch(() => ({ accessToken: undefined, refreshToken: undefined }));
  if (!native.accessToken || !native.refreshToken) return;
  // Explicit sign-out must always win over a still-running Android service.
  if (typeof window !== "undefined" && explicitSignOutRole(window.localStorage)) {
    await plugin.stop().catch(() => {});
    return;
  }
  const { data } = await supabase.auth.getSession();
  if (data.session?.refresh_token === native.refreshToken) return;
  // Recover a WebView that lost its old rotated token while locked. The native
  // service still holds the confirmed Driver session in volatile memory.
  await supabase.auth.setSession({
    access_token: native.accessToken, refresh_token: native.refreshToken,
  });
}

export async function startNativeDriverGps(): Promise<boolean> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.refresh_token) return false;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  try {
    const result = await plugin.start({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      authUrl: publicConfig.supabaseUrl,
      publishableKey: publicConfig.supabaseKey,
    });
    return result.status === "started";
  } catch { return false; }
}
export async function stopNativeDriverGps(): Promise<void> {
  const cap = await nativeCapacitor();
  if (!cap || await getNexRideNativeAppRole() !== "driver") return;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  await plugin.stop().catch(() => {});
}

"use client";

import { supabase } from "./supabase";
import { nexrideApiFetch } from "./nexride-api-auth";

type Role = "rider" | "driver";
type NativeDriverLocation = {
  start(options: { accessToken: string }): Promise<{ status: string }>;
  stop(): Promise<void>;
  status(): Promise<{ running: boolean }>;
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

export async function enableNexRideNativeNotifications(role: Role) {
  if (!await nativeCapacitor()) return "web_only" as const;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return "denied" as const;
  await PushNotifications.createChannel({ id: role === "driver" ? "nexride_driver_requests" : "nexride_trip_updates",
    name: role === "driver" ? "Ride requests" : "Trip updates",
    description: "Important NexRide ride and trip events", importance: role === "driver" ? 4 : 3,
    vibration: true, visibility: 1 });
  sessionStorage.setItem("nexride.push.role", role);
  await PushNotifications.register();
  return "registration_started" as const;
}

export async function reconcileNexRideNativePush(role: Role) {
  if (!await nativeCapacitor()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== "granted") return;
  sessionStorage.setItem("nexride.push.role", role);
  await PushNotifications.register();
}

export async function registerNexRidePushToken(token: string) {
  const { data } = await supabase.auth.getSession();
  const role = sessionStorage.getItem("nexride.push.role");
  if (!data.session || (role !== "driver" && role !== "rider") || !token) return;
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "POST", body: JSON.stringify({ role, token, installationId: installationId() }),
  });
  if (!result.ok) throw new Error("device_registration_failed");
}

export async function unregisterNexRidePushDevice(role: Role) {
  if (!await nativeCapacitor()) return;
  const result = await nexrideApiFetch("/api/native/devices", {
    method: "DELETE", body: JSON.stringify({ role, installationId: installationId() }),
  });
  if (!result.ok) throw new Error("device_unregistration_failed");
}

export async function nativeDriverGpsStatus() {
  const cap = await nativeCapacitor();
  if (!cap) return null;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  return plugin.status();
}
export async function startNativeDriverGps(): Promise<boolean> {
  const cap = await nativeCapacitor();
  if (!cap) return false;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  try {
    const result = await plugin.start({ accessToken: data.session.access_token });
    return result.status === "started";
  } catch { return false; }
}
export async function stopNativeDriverGps(): Promise<void> {
  const cap = await nativeCapacitor();
  if (!cap) return;
  const plugin = cap.registerPlugin<NativeDriverLocation>("NexRideDriverLocation");
  await plugin.stop().catch(() => {});
}

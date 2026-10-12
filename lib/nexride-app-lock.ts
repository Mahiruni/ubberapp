"use client";

import { supabase } from "./supabase";

export type AppLockStatus = {
  enabled: boolean;
  locked: boolean;
  method: "pin" | "pattern";
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  timeout: number;
};
type NativeAppLock = {
  status(): Promise<AppLockStatus>;
  openSettings(options: { accessToken: string; language: "en" | "am" }): Promise<void>;
  lockNow(): Promise<void>;
};

async function plugin() {
  const { Capacitor, registerPlugin } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
  if (!Capacitor.isPluginAvailable("NexRideAppLock")) throw new Error("app_update_required");
  return registerPlugin<NativeAppLock>("NexRideAppLock");
}
export async function getAppLockStatus() {
  const native = await plugin();
  return native ? native.status() : null;
}
export async function openAppLockSettings(language: "en" | "am") {
  const native = await plugin();
  if (!native) throw new Error("android_app_required");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error("sign_in_required");
  // The native gate verifies this token against Auth and independently requests
  // the account password; no web method can unlock or change lock credentials.
  await native.openSettings({ accessToken: data.session.access_token, language });
}
export async function lockNexRideNow() {
  const native = await plugin();
  if (native) await native.lockNow();
}

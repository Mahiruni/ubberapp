import { Capacitor, registerPlugin } from "@capacitor/core";

type LocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type NativeSessionBridge = {
  resolveSession(options: { session: string | null; writing: boolean; origin: string; publishableKey: string }): Promise<{ session: string | null }>;
  clearSession(): Promise<unknown>;
};
const plugin = registerPlugin<NativeSessionBridge>("NexRideDriverLocation");
export function hasNativeDriverSessionBridge() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("NexRideDriverLocation");
}

/** Read rotated native credentials before Supabase can refresh an old WebView token.
 * Other APK roles and web/PWA retain their ordinary browser storage behavior.
 */
export function createDriverAuthStorage(options: {
  key: string; origin: string; publishableKey: string;
  local: () => LocalStorage;
  native?: () => NativeSessionBridge | null;
}) {
  let revision = 0;
  let legacyPlugin = false;
  const native = () => legacyPlugin ? null : options.native ? options.native() :
    hasNativeDriverSessionBridge() ? plugin : null;
  const unsupported = (error: unknown) => {
    const code = (error as { code?: string })?.code;
    if (code === "UNIMPLEMENTED" || code === "UNAVAILABLE") { legacyPlugin = true; return true; }
    return false;
  };
  const invalidated = () => {
    if (typeof window !== "undefined") window.dispatchEvent(new Event("biloo:native-session-invalidated"));
  };
  return {
    async getItem(key: string): Promise<string | null> {
      const local = options.local();
      const value = local.getItem(key);
      const bridge = key === options.key ? native() : null;
      if (!bridge) return value;
      const startedAt = revision;
      try {
        const result = await bridge.resolveSession({ session: value, writing: false, origin: options.origin, publishableKey: options.publishableKey });
        if (revision !== startedAt) return local.getItem(key);
        if (result.session === null) { local.removeItem(key); if (value !== null) invalidated(); }
        else local.setItem(key, result.session);
        return result.session;
      } catch (error) {
        if (unsupported(error)) return local.getItem(key);
        if (revision === startedAt) { local.removeItem(key); if (value !== null) invalidated(); }
        return local.getItem(key); // Never fall back to an obsolete refresh token.
      }
    },
    async setItem(key: string, value: string): Promise<void> {
      const local = options.local();
      if (key !== options.key) { local.setItem(key, value); return; }
      const startedAt = ++revision;
      local.setItem(key, value);
      const bridge = native();
      if (!bridge) return;
      try {
        const result = await bridge.resolveSession({ session: value, writing: true, origin: options.origin, publishableKey: options.publishableKey });
        if (revision !== startedAt) return;
        if (result.session === null) local.removeItem(key);
        else local.setItem(key, result.session);
      } catch (error) {
        if (unsupported(error)) return;
        if (revision === startedAt) local.removeItem(key);
        throw new Error("Native session storage is unavailable");
      }
    },
    async removeItem(key: string): Promise<void> {
      const local = options.local();
      if (key === options.key) revision += 1;
      local.removeItem(key); // The local logout barrier precedes asynchronous cleanup.
      const bridge = key === options.key ? native() : null;
      if (bridge) {
        try { await bridge.clearSession(); }
        catch (error) { unsupported(error); }
      }
    },
  };
}

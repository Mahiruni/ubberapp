"use client";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { reconcileNexRideNativePush, registerNexRidePushToken } from "../../lib/nexride-native-reliability";

/** One Capacitor subscription for both account roles and all route changes. */
export function NexRideNativePushBootstrap() {
  useEffect(() => {
    let removed = false;
    let unsub: Array<{ remove: () => Promise<void> }> = [];
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const registered = await PushNotifications.addListener("registration", event => {
        void registerNexRidePushToken(event.value).catch(() => {});
      });
      const opened = await PushNotifications.addListener("pushNotificationActionPerformed", event => {
        const url = event.notification.data?.url;
        if (typeof url !== "string") return;
        // Only known first-party routes are accepted from the untrusted payload.
        if (/^\/driver\/request\?offer=[0-9a-f-]{36}$/i.test(url) ||
          url === "/rider/trips" || url === "/driver/home") window.location.assign(url);
      });
      unsub = [registered, opened];
      if (removed) { await Promise.all(unsub.map(s => s.remove())); return; }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const role = window.location.pathname.startsWith("/driver") ? "driver" : "rider";
        await reconcileNexRideNativePush(role).catch(() => {});
      }
    })().catch(() => {});
    return () => { removed = true; void Promise.all(unsub.map(s => s.remove())); };
  }, []);
  return null;
}

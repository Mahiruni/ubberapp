"use client";
import { useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { nexridePushDestination } from "../../lib/nexride-push-routing";
import {
  getNexRideNativeAppRole,
  reconcileNexRideNativePush,
  registerNexRidePushToken,
} from "../../lib/nexride-native-reliability";

/** One native push registration lifecycle across sign-in, resume and route changes.
 * Never request Android notification permission without user interaction.
 */
export function NexRideNativePushBootstrap() {
  useEffect(() => {
    let removed = false;
    let subscriptions: Array<{ remove: () => Promise<void> }> = [];
    let authSubscription: { unsubscribe: () => void } | null = null;
    let registrationInFlight = false;

    const syncIfPermitted = async () => {
      if (removed || registrationInFlight) return;
      registrationInFlight = true;
      try {
        const role = await getNexRideNativeAppRole();
        if (!role || removed) return;
        const { data } = await supabase.auth.getSession();
        if (!data.session || removed) return;
        await reconcileNexRideNativePush(role);
      } catch {
        // Settings offers a user-initiated retry; never log or expose FCM tokens.
      } finally { registrationInFlight = false; }
    };

    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || removed) return;
      const { PushNotifications } = await import("@capacitor/push-notifications");
      const registration = await PushNotifications.addListener("registration", event => {
        void registerNexRidePushToken(event.value).catch(() => {
          window.dispatchEvent(new CustomEvent("nexride:native-push-status", {
            detail: { status: "registration_failed" },
          }));
        });
      });
      const registrationError = await PushNotifications.addListener("registrationError", () => {
        window.dispatchEvent(new CustomEvent("nexride:native-push-status", {
          detail: { status: "firebase_registration_failed" },
        }));
      });
      const opened = await PushNotifications.addListener("pushNotificationActionPerformed", event => {
        void (async () => {
          const role = await getNexRideNativeAppRole();
          const url = nexridePushDestination(event.notification.data, role);
          if (!url || removed) return;

          // FCM TTL prevents late delivery, not stale entries in Android's tray.
          // Verify current server state before opening an actionable offer.
          let destination = url;
          const match = role === "driver"
            ? /^\/driver\/request\?offer=([0-9a-f-]{36})$/i.exec(url)
            : null;
          if (match) {
            const { data, error } = await supabase.from("ride_request_offers")
              .select("status,expires_at")
              .eq("id", match[1]).maybeSingle();
            if (error || !data || data.status !== "pending" ||
                (data.expires_at && Date.parse(data.expires_at) <= Date.now())) {
              destination = "/driver/activity";
            }
          }
          if (!removed) window.location.assign(destination);
        })().catch(() => {
          // Never follow a raw, unvalidated URL when a native callback fails.
        });
      });
      subscriptions = [registration, registrationError, opened];
      if (removed) { await Promise.all(subscriptions.map(s => s.remove())); return; }
      const { data } = supabase.auth.onAuthStateChange(event => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          // Supabase does not permit awaiting getSession() synchronously in its auth callback.
          window.setTimeout(() => { void syncIfPermitted(); }, 0);
        }
      });
      authSubscription = data.subscription;
      window.addEventListener("focus", syncIfPermitted);\n      window.addEventListener("biloo:native-resume", syncIfPermitted);
      document.addEventListener("visibilitychange", onVisible);
      await syncIfPermitted();
    })().catch(() => {});

    function onVisible() {
      if (document.visibilityState === "visible") void syncIfPermitted();
    }
    return () => {
      removed = true;
      window.removeEventListener("focus", syncIfPermitted);\n      window.removeEventListener("biloo:native-resume", syncIfPermitted);
      document.removeEventListener("visibilitychange", onVisible);
      authSubscription?.unsubscribe();
      void Promise.all(subscriptions.map(s => s.remove()));
    };
  }, []);
  return null;
}

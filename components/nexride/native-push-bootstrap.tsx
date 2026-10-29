"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { nativeRideAlertsPlugin, queueNativeRideAction, disableNativeRideAlerts } from "../../lib/biloo-native-ride-alerts";
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
  const router = useRouter();
  useEffect(() => {
    let removed = false;
    let subscriptions: Array<{ remove: () => Promise<void> }> = [];
    let authSubscription: { unsubscribe: () => void } | null = null;
    let registrationInFlight = false;
    let actionInFlight = false, unlockAttempts = 0;
    let unlockRetry: ReturnType<typeof setTimeout> | null = null;
    const consumeRideAction = async () => {
      if (removed || actionInFlight) return;
      actionInFlight = true;
      try {
        if (await getNexRideNativeAppRole() !== "driver") return;
        const { data } = await supabase.auth.getSession();
        if (!data.session || removed) return;
        const native = await nativeRideAlertsPlugin();
        if (!native || removed) return;
        const command = await native.consumeAction({userId: data.session.user.id});
        if (command.waitingForUnlock) {
          if (++unlockAttempts <= 35) unlockRetry = setTimeout(() => { void consumeRideAction(); }, 1000);
          return;
        }
        unlockAttempts = 0;
        const valid = queueNativeRideAction(command, data.session.user.id);
        if (!valid || removed) return;
        router.push(valid.action === "expired" ? "/driver/activity" : "/driver/request?offer=" + valid.offerId);
      } catch { /* A failed native handoff must never execute an unverified action. */ }
      finally { actionInFlight = false; }
    };

    const syncIfPermitted = async () => {
      if (removed || registrationInFlight) return;
      registrationInFlight = true;
      try {
        const role = await getNexRideNativeAppRole();
        if (!role || removed) return;
        const { data } = await supabase.auth.getSession();
        if (!data.session || removed) return;
        await reconcileNexRideNativePush(role);
        void consumeRideAction();
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
      const nativeAlerts = await nativeRideAlertsPlugin();
      if (nativeAlerts) subscriptions.push(await nativeAlerts.addListener("rideAction", () => { void consumeRideAction(); }));
      if (removed) { await Promise.all(subscriptions.map(s => s.remove())); return; }
      const { data } = supabase.auth.onAuthStateChange(event => {
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          // Supabase does not permit awaiting getSession() synchronously in its auth callback.
          window.setTimeout(() => { void syncIfPermitted(); }, 0);
        } else if (event === "SIGNED_OUT") {
          void disableNativeRideAlerts();
        }
      });
      authSubscription = data.subscription;
      window.addEventListener("focus", syncIfPermitted);
      window.addEventListener("biloo:native-resume", syncIfPermitted);
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("biloo:native-resume", consumeRideAction);
      window.addEventListener("focus", consumeRideAction);
      await syncIfPermitted();
      void consumeRideAction();
    })().catch(() => {});

    function onVisible() {
      if (document.visibilityState === "visible") void syncIfPermitted();
    }
    return () => {
      removed = true;
      if (unlockRetry) clearTimeout(unlockRetry);
      window.removeEventListener("focus", syncIfPermitted);
      window.removeEventListener("biloo:native-resume", syncIfPermitted);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("biloo:native-resume", consumeRideAction);
      window.removeEventListener("focus", consumeRideAction);
      authSubscription?.unsubscribe();
      void Promise.all(subscriptions.map(s => s.remove()));
    };
  }, [router]);
  return null;
}

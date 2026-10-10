"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { explicitSignOutRole } from "../../lib/nexride-startup";
import { emitNexRideFeedback } from "../../lib/nexride-feedback";
import { eligibleDriverOffer, shouldOpenDriverOffer } from "../../lib/nexride-driver-presence";

export const DRIVER_AVAILABILITY_CHANGED = "nexride:driver-availability-changed";

type PendingDriverOffer = { id: string; expires_at: string | null; status: string };
type DriverOnline = { is_online: boolean; review_status: string };

/**
 * Persistent driver runtime: remains mounted as the driver moves among
 * dashboard, activity, earnings, request, profile and navigation screens.
 * The server owns the Online state; window blur/visibility never sets Offline.
 *
 * Background JavaScript and browser GPS may be paused by Android. We reconcile
 * on focus/visibility/online, and show a system notification opportunistically.
 * Reliable terminated/background delivery still needs a server push provider.
 */
export function DriverSessionBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const handledRef = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    let driverId = "";
    let activeOnline = false;
    let inflight = false;
    let lastGpsSent = 0;
    let gpsUploadInFlight = false;
    let gpsWatch: number | null = null;
    let offerChannel: ReturnType<typeof supabase.channel> | null = null;
    let availabilityChannel: ReturnType<typeof supabase.channel> | null = null;

    const notifyOffer = (offer: PendingDriverOffer) => {
      if (!mounted || !activeOnline || !eligibleDriverOffer(offer)) return;
      if (!handledRef.current.has(offer.id)) {
        handledRef.current.add(offer.id);
        emitNexRideFeedback({
          event: "ride_request",
          id: offer.id,
          expiresAt: offer.expires_at,
          title: "New ride request",
          body: "A NexRide rider is waiting for your decision.",
          url: "/driver/request?offer=" + encodeURIComponent(offer.id),
        });
        // Browser notifications are best-effort while minimized. They require
        // explicit user permission and may be suspended by the operating system.
        if (document.visibilityState === "hidden" && typeof Notification !== "undefined" &&
          Notification.permission === "granted" && "serviceWorker" in navigator) {
          void navigator.serviceWorker?.ready.then(reg =>
            reg.showNotification("New NexRide ride request", {
              body: "Open NexRide to accept, decline or pass this ride.",
              tag: "nexride-offer-" + offer.id,
              icon: "/icons/icon-192.png",
              data: { url: "/driver/request?offer=" + encodeURIComponent(offer.id) },
            }),
          ).catch(() => {});
        }
      }
      if (shouldOpenDriverOffer(pathnameRef.current, document.visibilityState)) {
        router.push("/driver/request?offer=" + encodeURIComponent(offer.id));
      }
    };

    const readPending = async () => {
      if (!mounted || !driverId || !activeOnline || !navigator.onLine || inflight) return;
      inflight = true;
      try {
        const { data } = await supabase.from("ride_request_offers")
          .select("id,status,expires_at")
          .eq("driver_id", driverId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (mounted && data) notifyOffer(data as PendingDriverOffer);
      } finally {
        inflight = false;
      }
    };

    const reconcileAvailability = async () => {
      if (!mounted || !driverId) return;
      const { data } = await supabase.from("drivers")
        .select("is_online,review_status").eq("id", driverId).maybeSingle();
      if (!mounted || !data) return;
      activeOnline = (data as DriverOnline).is_online === true &&
        (data as DriverOnline).review_status === "approved";
      if (activeOnline) void readPending();
    };

    const sendGps = (position: GeolocationPosition) => {
      if (!mounted || !activeOnline || !navigator.onLine || gpsUploadInFlight) return;
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
          !Number.isFinite(longitude) || Math.abs(longitude) > 180) return;
      // Only advertise recent real GPS fixes. Never use a cached, outdated
      // device position to make a driver look available to nearby riders.
      if (Date.now() - position.timestamp > 30_000) return;
      if (Date.now() - lastGpsSent < 10_000) return;
      gpsUploadInFlight = true;
      void nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ location: {
          latitude,
          longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
        } }),
      }).then((response) => {
        if (!mounted) return;
        if (response.ok) lastGpsSent = Date.now();
        window.dispatchEvent(new CustomEvent("nexride:driver-gps-sync", {
          detail: { status: response.ok ? "synced" : "error", at: Date.now() },
        }));
      }).catch(() => {
        if (mounted) window.dispatchEvent(new CustomEvent("nexride:driver-gps-sync", {
          detail: { status: "error", at: Date.now() },
        }));
        // Keep retrying later; do not mark an unsuccessful GPS upload fresh.
      }).finally(() => {
        gpsUploadInFlight = false;
      });
    };

    const stopGps = () => {
      if (gpsWatch !== null) {
        navigator.geolocation?.clearWatch(gpsWatch);
        gpsWatch = null;
      }
    };
    const startGps = () => {
      if (!activeOnline || gpsWatch !== null || !navigator.geolocation) return;
      gpsWatch = navigator.geolocation.watchPosition(sendGps, () => {
        // Do not silently take the driver offline when Android suspends GPS.
        // On returning to the app, location/availability are rechecked.
      }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
    };

    const onResume = () => {
      if (!mounted) return;
      void reconcileAvailability().then(() => {
        if (!mounted) return;
        if (!activeOnline) { stopGps(); return; }
        startGps();
        if (document.visibilityState === "visible") {
          navigator.geolocation?.getCurrentPosition(sendGps, () => {},
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 });
        }
      }).catch(() => {});
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onResume();
      // Do not stop availability, clear the offer subscription, or turn
      // offline on hide. The OS may pause JS and GPS until the app resumes.
    };

    const bootstrap = async () => {
      if (explicitSignOutRole(window.localStorage)) return;
      const { data: session } = await supabase.auth.getSession();
      if (explicitSignOutRole(window.localStorage)) return;
      const id = session.session?.user.id || "";
      if (!mounted || !id) return;
      const { data: profile } = await supabase.from("profiles")
        .select("role,account_status").eq("id", id).maybeSingle();
      if (!mounted || profile?.role !== "driver" || profile.account_status !== "active") return;
      driverId = id;
      await reconcileAvailability();
      if (!mounted) return;
      if (activeOnline) {
        startGps();
        // An already-Online driver must publish immediately on app re-entry,
        // not wait for the next GPS watchPosition movement event.
        navigator.geolocation?.getCurrentPosition(sendGps, () => {}, {
          enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000,
        });
      }

      offerChannel = supabase.channel("driver-shell-offers:" + id)
        .on("postgres_changes", {
          event: "INSERT", schema: "public", table: "ride_request_offers",
          filter: "driver_id=eq." + id,
        }, payload => notifyOffer(payload.new as PendingDriverOffer))
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "ride_request_offers",
          filter: "driver_id=eq." + id,
        }, payload => {
          if ((payload.new as PendingDriverOffer).status !== "pending")
            handledRef.current.delete(String(payload.new.id));
        })
        .subscribe(status => { if (status === "SUBSCRIBED") void readPending(); });

      availabilityChannel = supabase.channel("driver-shell-availability:" + id)
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "drivers", filter: "id=eq." + id,
        }, payload => {
          const data = payload.new as DriverOnline;
          const wasOnline = activeOnline;
          activeOnline = data.is_online === true && data.review_status === "approved";
          if (activeOnline) {
            startGps();
            // Location-only row updates also fire this subscription. Only
            // reacquire a one-shot GPS fix when availability turns Online.
            if (!wasOnline) {
              navigator.geolocation?.getCurrentPosition(sendGps, () => {}, {
                enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000,
              });
            }
            void readPending();
          } else {
            stopGps();
          }
        }).subscribe();
    };

    void bootstrap().catch(() => {});
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    window.addEventListener(DRIVER_AVAILABILITY_CHANGED, onResume);
    document.addEventListener("visibilitychange", onVisibility);
    // Poll when permitted. Suspended timers aren't relied on for correctness.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void readPending();
    }, 8_000);
    // A stationary Driver may receive no watchPosition movement callbacks.
    // Refresh a real device fix periodically while the app is foregrounded,
    // so server-side proximity matching never relies on a stale coordinate.
    // Browsers/Android can pause this timer in the background; resume already
    // obtains a fresh fix, and the server remains authoritative.
    const gpsHeartbeat = window.setInterval(() => {
      if (!mounted || !activeOnline || !navigator.onLine ||
          document.visibilityState !== "visible" || gpsUploadInFlight) return;
      navigator.geolocation?.getCurrentPosition(sendGps, () => {}, {
        enableHighAccuracy: true, maximumAge: 5_000, timeout: 12_000,
      });
    }, 25_000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.clearInterval(gpsHeartbeat);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener(DRIVER_AVAILABILITY_CHANGED, onResume);
      document.removeEventListener("visibilitychange", onVisibility);
      stopGps();
      if (offerChannel) void supabase.removeChannel(offerChannel);
      if (availabilityChannel) void supabase.removeChannel(availabilityChannel);
    };
  }, [router]);

  return null;
}

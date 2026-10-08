"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
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
        if (document.visibilityState === "hidden" && Notification.permission === "granted") {
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
      if (!mounted || !activeOnline || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastGpsSent < 12_000) return;
      lastGpsSent = now;
      void nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        } }),
      }).catch(() => {});
    };

    const startGps = () => {
      if (gpsWatch !== null || !navigator.geolocation) return;
      gpsWatch = navigator.geolocation.watchPosition(sendGps, () => {
        // Do not silently take the driver offline when Android suspends GPS.
        // On returning to the app, location/availability are rechecked.
      }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
    };

    const onResume = () => {
      if (!mounted) return;
      void reconcileAvailability();
      if (activeOnline && document.visibilityState === "visible") {
        navigator.geolocation?.getCurrentPosition(sendGps, () => {},
          { enableHighAccuracy: true, maximumAge: 10_000, timeout: 12_000 });
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") onResume();
      // Do not stop availability, clear the offer subscription, or turn
      // offline on hide. The OS may pause JS and GPS until the app resumes.
    };

    const bootstrap = async () => {
      const { data: session } = await supabase.auth.getSession();
      const id = session.session?.user.id || "";
      if (!mounted || !id) return;
      const { data: profile } = await supabase.from("profiles")
        .select("role,account_status").eq("id", id).maybeSingle();
      if (!mounted || profile?.role !== "driver" || profile.account_status !== "active") return;
      driverId = id;
      await reconcileAvailability();
      if (!mounted) return;
      startGps();

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
          activeOnline = data.is_online === true && data.review_status === "approved";
          if (activeOnline) void readPending();
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
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      window.removeEventListener(DRIVER_AVAILABILITY_CHANGED, onResume);
      document.removeEventListener("visibilitychange", onVisibility);
      if (gpsWatch !== null) navigator.geolocation?.clearWatch(gpsWatch);
      if (offerChannel) void supabase.removeChannel(offerChannel);
      if (availabilityChannel) void supabase.removeChannel(availabilityChannel);
    };
  }, [router]);

  return null;
}

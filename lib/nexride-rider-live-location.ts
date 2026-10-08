"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { RiderLocation } from "./nexride-location";

const ACTIVE = new Set(["accepted", "arrived_pickup", "in_trip"]);
const FRESH_MS = 25000;

export type RiderGpsFix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: number;
};

function validCoordinate(lat: unknown, lng: unknown): lat is number {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180;
}

export function parseRiderGpsFix(value: Record<string, unknown>, rideId: string): RiderGpsFix | null {
  if (value.ride_request_id !== rideId || !validCoordinate(value.latitude, value.longitude)) return null;
  const time = Date.parse(String(value.recorded_at || ""));
  if (!Number.isFinite(time) || time > Date.now() + 30000) return null;
  const accuracy = typeof value.accuracy_meters === "number" && Number.isFinite(value.accuracy_meters)
    ? value.accuracy_meters : null;
  return { lat: value.latitude, lng: value.longitude as number, accuracy, recordedAt: time };
}

function movedMeters(a: Pick<RiderGpsFix, "lat" | "lng">, b: Pick<RiderGpsFix, "lat" | "lng">) {
  const rad = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Shares current GPS only while this signed-in rider has a confirmed active assignment. */
export function useRiderTripLocationPublisher(
  userId: string | null,
  tripId: string | null,
  tripState: unknown,
  position: RiderLocation | null,
) {
  const sent = useRef<{ tripId: string; fix: RiderGpsFix; sentAt: number } | null>(null);
  const pending = useRef(false);
  const [shareError, setShareError] = useState(false);
  const active = !!userId && !!tripId && ACTIVE.has(String(tripState));

  useEffect(() => {
    if (!active || !tripId || !userId || !position || pending.current) return;
    if (typeof document === "undefined" || document.visibilityState !== "visible" || !navigator.onLine) return;
    if (!validCoordinate(position.lat, position.lng) || !Number.isFinite(position.timestamp)) return;
    if (Date.now() - position.timestamp > 15000 || position.timestamp > Date.now() + 30000) return;
    if (!Number.isFinite(position.accuracy) || position.accuracy > 2000 || position.accuracy < 0) return;
    const previous = sent.current;
    const now = Date.now();
    if (previous?.tripId === tripId &&
      now - previous.sentAt < 25000 &&
      (now - previous.sentAt < 5000 || movedMeters(previous.fix, position) < 10)) return;

    let cancelled = false;
    pending.current = true;
    void supabase.from("ride_rider_locations").upsert({
      ride_request_id: tripId,
      rider_id: userId,
      latitude: position.lat,
      longitude: position.lng,
      accuracy_meters: position.accuracy,
    }, { onConflict: "ride_request_id" }).then(({ error }) => {
      if (cancelled) return;
      setShareError(!!error);
      if (!error) {
        sent.current = {
          tripId,
          fix: { lat: position.lat, lng: position.lng, accuracy: position.accuracy, recordedAt: now },
          sentAt: now,
        };
      }
    }).finally(() => { pending.current = false; });

    return () => { cancelled = true; };
  }, [active, tripId, userId, position?.lat, position?.lng, position?.timestamp, position?.accuracy]);

  useEffect(() => {
    if (!active) {
      sent.current = null;
      // No client-side DELETE: the database trigger erases terminal-trip locations.
    }
  }, [active, tripId]);

  return { sharing: active && !!position && !shareError, shareError };
}

/** Reads only the row allowed by server-enforced trip-participant RLS. */
export function useAssignedRiderLocation(
  rideId: string | null,
  driverId: string | null,
  tripState: unknown,
) {
  const active = !!rideId && !!driverId && ACTIVE.has(String(tripState));
  const [fix, setFix] = useState<RiderGpsFix | null>(null);
  const [ready, setReady] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!active || !rideId) {
      setFix(null);
      setReady(false);
      return;
    }

    let cancelled = false;
    let latestTime = 0;
    setFix(null);
    setReady(false);
    setOffline(!navigator.onLine);

    const accept = (row: Record<string, unknown>) => {
      if (cancelled) return;
      const next = parseRiderGpsFix(row, rideId);
      if (next && next.recordedAt >= latestTime) {
        latestTime = next.recordedAt;
        setFix(next);
      }
      setReady(true);
    };

    const refresh = async () => {
      if (!navigator.onLine || cancelled) return;
      const { data, error } = await supabase
        .from("ride_rider_locations")
        .select("ride_request_id,latitude,longitude,accuracy_meters,recorded_at")
        .eq("ride_request_id", rideId)
        .maybeSingle();
      if (cancelled) return;
      if (!error && data) accept(data as Record<string, unknown>);
      setReady(true);
    };

    const channel = supabase.channel(`driver-rider-location:${rideId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "ride_rider_locations",
        filter: `ride_request_id=eq.${rideId}`,
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setFix(null);
          return;
        }
        accept(payload.new as Record<string, unknown>);
      }).subscribe((state) => {
        if (state === "SUBSCRIBED") void refresh();
      });

    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const connection = () => { setOffline(!navigator.onLine); if (navigator.onLine) void refresh(); };
    void refresh();
    const interval = window.setInterval(() => {
      setClock(Date.now());
      if (document.visibilityState === "visible") void refresh();
    }, 10000);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("visibilitychange", visibility);
      void supabase.removeChannel(channel);
    };
  }, [active, rideId, driverId]);

  const status = useMemo<"live" | "stale" | "unavailable">(() => {
    if (!active || !fix) return "unavailable";
    return offline || clock - fix.recordedAt > FRESH_MS ? "stale" : "live";
  }, [active, fix, clock, offline]);

  return { fix: active ? fix : null, status, ready };
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverNavigationMap, type NavigationCoordinate } from "../../../components/nexride/driver-navigation-map";
import { Icon } from "../../../components/nexride/ui";
import { useOperationalTranslation } from "../../../components/nexride/operational-i18n";
import { supabase } from "../../../lib/supabase";
import { nexrideApiFetch } from "../../../lib/nexride-api-auth";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import "../../nexride.css";
import "./navigation.css";

type TripStatus = "accepted" | "arrived_pickup" | "in_trip" | "completed" | "withdrawn" | "cancelled";
type GpsState = "acquiring" | "fresh" | "stale" | "lost" | "unsupported";
type MapView = "overview" | "vehicle";
type GuidanceStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: NavigationCoordinate;
  type?: string;
  modifier?: string;
  roadName?: string;
};
type NativeRoute = {
  target: "pickup" | "destination";
  geometry: NavigationCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  steps: GuidanceStep[];
  generatedAt: number;
};

type NavigationData = {
  offerId: string;
  requestId: string;
  status: TripStatus;
  rideCategory: string;
  pickup: string;
  destination: string;
  pickupCoordinate: NavigationCoordinate | null;
  destinationCoordinate: NavigationCoordinate | null;
  pickupDistanceKm: number | null;
  pickupEtaMinutes: number | null;
  tripDistanceKm: number | null;
  tripDurationMinutes: number | null;
};

type VehiclePosition = NavigationCoordinate & {
  accuracy: number | null;
  heading: number | null;
  timestamp: number;
};

const asNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const coordinate = (lat: unknown, lng: unknown): NavigationCoordinate | null => {
  const a = asNumber(lat), b = asNumber(lng);
  return a === null || b === null ? null : { lat: a, lng: b };
};
const normalizeStatus = (v: unknown): TripStatus | null =>
  v === "accepted" || v === "arrived_pickup" || v === "in_trip" || v === "completed" || v === "withdrawn" || v === "cancelled" ? v : null;

function navigationUrl(target: NavigationCoordinate | null, label: string) {
  const destination = target ? `${target.lat},${target.lng}` : label;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving&dir_action=navigate`;
}
function distanceLabel(value: number | null) {
  if (value === null) return "Distance unavailable";
  return value < 1 ? `${Math.max(1, Math.round(value * 1000))} m` : `${value.toFixed(1)} km`;
}
function metersLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Distance unavailable";
  return value < 1000
    ? `${Math.max(10, Math.round(value / 10) * 10)} m`
    : `${(value / 1000).toFixed(1)} km`;
}

function positionDistanceMeters(a: VehiclePosition | null, b: VehiclePosition | null) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export default function DriverNavigationPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const [driverId, setDriverId] = useState("");
  const [trip, setTrip] = useState<NavigationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [gpsState, setGpsState] = useState<GpsState>("acquiring");
  const [gpsMessage, setGpsMessage] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const [position, setPosition] = useState<VehiclePosition | null>(null);
  const [mapView, setMapView] = useState<MapView>("overview");
  const lastFixRef = useRef<number | null>(null);
  const previousGpsRef = useRef<GpsState>("acquiring");
  const lastSharedAtRef = useRef(0);
  const lastSharedPositionRef = useRef<VehiclePosition | null>(null);
  const lastAvailabilityAtRef = useRef(0);
  const sharingRef = useRef(false);
  const routePendingRef = useRef(false);
  const lastRouteAtRef = useRef(0);
  const lastRoutePositionRef = useRef<VehiclePosition | null>(null);
  const lastRouteTargetRef = useRef<"pickup" | "destination" | null>(null);
  const routeBackoffUntilRef = useRef(0);
  const [locationShareError, setLocationShareError] = useState("");
  const [nativeRoute, setNativeRoute] = useState<NativeRoute | null>(null);
  const [nativeRouteNotice, setNativeRouteNotice] = useState("");

  const loadTrip = useCallback(async (userId: string, offerId: string) => {
    const { data: offer, error: offerError } = await supabase
      .from("ride_request_offers")
      .select("id,request_id,status,pickup_distance_km,pickup_eta_minutes")
      .eq("id", offerId).eq("driver_id", userId).maybeSingle();

    if (offerError || !offer) throw new Error("The accepted ride offer could not be loaded.");
    if (offer.status !== "accepted") throw new Error("This ride is no longer assigned to you.");

    const { data: ride, error: rideError } = await supabase
      .from("ride_requests")
      .select("id,pickup_location,destination_location,pickup_lat,pickup_lng,destination_lat,destination_lng,ride_category,status,assigned_driver_id,estimated_trip_duration_minutes,estimated_trip_distance_km")
      .eq("id", offer.request_id).maybeSingle();

    if (rideError || !ride) throw new Error("The active trip could not be loaded.");
    if (ride.assigned_driver_id !== userId) throw new Error("This trip is assigned to another driver.");
    const status = normalizeStatus(ride.status);
    if (!status) throw new Error("This trip is not in a navigable state.");

    const next: NavigationData = {
      offerId: offer.id,
      requestId: ride.id,
      status,
      rideCategory: ride.ride_category || "Ride",
      pickup: ride.pickup_location,
      destination: ride.destination_location,
      pickupCoordinate: coordinate(ride.pickup_lat, ride.pickup_lng),
      destinationCoordinate: coordinate(ride.destination_lat, ride.destination_lng),
      pickupDistanceKm: asNumber(offer.pickup_distance_km),
      pickupEtaMinutes: asNumber(offer.pickup_eta_minutes),
      tripDistanceKm: asNumber(ride.estimated_trip_distance_km),
      tripDurationMinutes: asNumber(ride.estimated_trip_duration_minutes),
    };
    setTrip(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }
      const role = await resolveSessionRole(session).catch(() => "");
      if (!active) return;
      if (role !== "driver") {
        router.replace(role === "admin" ? "/admin" : "/");
        return;
      }

      const offerId = new URLSearchParams(window.location.search).get("offer");
      if (!offerId) {
        setMessage("No active trip was provided.");
        setLoading(false);
        return;
      }

      setDriverId(session.user.id);
      try {
        const loaded = await loadTrip(session.user.id, offerId);
        if (!active) return;
        channel = supabase
          .channel(`driver-trip-${loaded.requestId}`)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ride_requests", filter: `id=eq.${loaded.requestId}` }, (payload) => {
            const row = payload.new as Record<string, unknown>;
            const status = normalizeStatus(row.status);
            if (!status) return;
            setTrip((current) => current ? {
              ...current,
              status,
              tripDistanceKm: asNumber(row.estimated_trip_distance_km) ?? current.tripDistanceKm,
              tripDurationMinutes: asNumber(row.estimated_trip_duration_minutes) ?? current.tripDurationMinutes,
            } : current);
          })
          .subscribe();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "We couldn’t load this trip.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadTrip, router]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsState("unsupported");
      setGpsMessage("This device does not expose browser GPS. External navigation may still provide location guidance.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        const prior = previousGpsRef.current;
        const timestamp = result.timestamp || Date.now();
        lastFixRef.current = timestamp;
        setPosition({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
          accuracy: Number.isFinite(result.coords.accuracy) ? result.coords.accuracy : null,
          heading: Number.isFinite(result.coords.heading ?? NaN) ? result.coords.heading : null,
          timestamp,
        });
        previousGpsRef.current = "fresh";
        setGpsState("fresh");
        setGpsMessage("");
        if (prior === "lost" || prior === "stale") {
          setRouteNotice("GPS restored. Reopen Maps if the external route needs recalculation from your latest position.");
        }
      },
      (error) => {
        previousGpsRef.current = "lost";
        setGpsState("lost");
        setGpsMessage(error.code === error.PERMISSION_DENIED
          ? "Location permission is blocked. Enable it to keep the vehicle marker current."
          : "GPS signal is unavailable. NexRide is keeping the trip stage unchanged until location returns.");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );

    const staleTimer = window.setInterval(() => {
      const last = lastFixRef.current;
      if (!last || Date.now() - last <= 30000 || previousGpsRef.current === "lost") return;
      previousGpsRef.current = "stale";
      setGpsState("stale");
      setGpsMessage("Location is stale. The vehicle marker shows the last fix; use external navigation for live routing.");
    }, 5000);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(staleTimer);
    };
  }, []);

  useEffect(() => {
    if (
      !position ||
      !trip ||
      !driverId ||
      !["accepted", "arrived_pickup", "in_trip"].includes(trip.status) ||
      sharingRef.current
    ) return;

    const now = Date.now();
    const moved = positionDistanceMeters(lastSharedPositionRef.current, position);
    if (now - lastSharedAtRef.current < 4000 && moved < 8) return;

    sharingRef.current = true;
    const payload = {
      ride_request_id: trip.requestId,
      driver_id: driverId,
      latitude: position.lat,
      longitude: position.lng,
      accuracy_meters: position.accuracy,
      heading_degrees: position.heading,
    };

    void (async () => {
      try {
        const { error: shareError } = await supabase
          .from("ride_driver_locations")
          .upsert(payload, { onConflict: "ride_request_id" });
        if (shareError) {
          setLocationShareError(op("Live location could not be shared with your rider. Check your connection."));
          return;
        }
        lastSharedAtRef.current = Date.now();
        lastSharedPositionRef.current = position;
        setLocationShareError("");
      } finally {
        sharingRef.current = false;
      }
    })();

    if (now - lastAvailabilityAtRef.current >= 12000) {
      lastAvailabilityAtRef.current = now;
      void nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({
          location: {
            latitude: position.lat,
            longitude: position.lng,
            accuracy: position.accuracy,
          },
        }),
      });
    }
  }, [driverId, position, trip]);

  useEffect(() => {
    if (!position || !trip || !driverId || routePendingRef.current) return;

    const target: "pickup" | "destination" | null =
      trip.status === "accepted" || trip.status === "arrived_pickup"
        ? "pickup"
        : trip.status === "in_trip"
          ? "destination"
          : null;

    if (!target) {
      setNativeRoute(null);
      setNativeRouteNotice("");
      return;
    }

    const now = Date.now();
    const targetChanged = lastRouteTargetRef.current !== target;
    const moved = positionDistanceMeters(lastRoutePositionRef.current, position);
    if (
      !targetChanged &&
      now < routeBackoffUntilRef.current
    ) return;
    if (
      !targetChanged &&
      now - lastRouteAtRef.current < 12000 &&
      moved < 25
    ) return;

    routePendingRef.current = true;
    void (async () => {
      try {
        const response = await nexrideApiFetch("/api/driver/route", {
          method: "POST",
          cache: "no-store",
          body: JSON.stringify({
            rideRequestId: trip.requestId,
            position: { lat: position.lat, lng: position.lng },
            target,
          }),
          signal: AbortSignal.timeout(9000),
        });

        const body = await response.json().catch(() => null);
        if (!response.ok || body?.status !== "ready") {
          if (response.status === 503 || body?.status === "provider_unavailable") {
            routeBackoffUntilRef.current = Date.now() + 60000;
            setNativeRouteNotice(op("NexRide road guidance is temporarily unavailable. Google Maps remains available."));
          } else if (response.status !== 409) {
            setNativeRouteNotice(op("Road guidance could not refresh. The last route and Google Maps remain available."));
          }
          return;
        }

        const geometry = Array.isArray(body.route?.geometry)
          ? body.route.geometry
              .map((point: unknown) =>
                Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]))
                  ? { lat: Number(point[0]), lng: Number(point[1]) }
                  : null,
              )
              .filter(Boolean) as NavigationCoordinate[]
          : [];

        const steps = Array.isArray(body.route?.steps)
          ? body.route.steps
              .map((step: Record<string, unknown>) => {
                const maneuver =
                  step.maneuver && typeof step.maneuver === "object"
                    ? step.maneuver as Record<string, unknown>
                    : {};
                const lat = Number(maneuver.lat);
                const lng = Number(maneuver.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                return {
                  instruction: typeof step.instruction === "string" && step.instruction ? step.instruction : "Continue on route",
                  distanceMeters: Number.isFinite(Number(step.distanceMeters)) ? Number(step.distanceMeters) : 0,
                  durationSeconds: Number.isFinite(Number(step.durationSeconds)) ? Number(step.durationSeconds) : 0,
                  maneuver: { lat, lng },
                  type: typeof step.type === "string" ? step.type : undefined,
                  modifier: typeof step.modifier === "string" ? step.modifier : undefined,
                  roadName: typeof step.roadName === "string" ? step.roadName : undefined,
                } satisfies GuidanceStep;
              })
              .filter(Boolean) as GuidanceStep[]
          : [];

        const distanceMeters = Number(body.route?.distanceMeters);
        const durationSeconds = Number(body.route?.durationSeconds);
        if (
          geometry.length < 2 ||
          !Number.isFinite(distanceMeters) ||
          !Number.isFinite(durationSeconds)
        ) return;

        setNativeRoute({
          target,
          geometry,
          steps,
          distanceMeters,
          durationSeconds,
          generatedAt: Number(body.generatedAt) || Date.now(),
        });
        lastRouteAtRef.current = Date.now();
        lastRoutePositionRef.current = position;
        lastRouteTargetRef.current = target;
        routeBackoffUntilRef.current = 0;
        setNativeRouteNotice("");
      } catch {
        setNativeRouteNotice(op("Road guidance could not refresh. Google Maps remains available."));
      } finally {
        routePendingRef.current = false;
      }
    })();
  }, [driverId, position, trip]);

  useEffect(() => {
    if (!routeNotice) return;
    const timer = window.setTimeout(() => setRouteNotice(""), 6500);
    return () => window.clearTimeout(timer);
  }, [routeNotice]);

  const stage = useMemo(() => {
    if (!trip) return null;
    if (trip.status === "accepted") return { target: "pickup" as const, title: "Navigate to pickup", destination: trip.pickup, coordinate: trip.pickupCoordinate, distance: trip.pickupDistanceKm, eta: trip.pickupEtaMinutes, badge: "PICKUP" };
    if (trip.status === "arrived_pickup") return { target: "pickup" as const, title: "Arrived at pickup", destination: trip.pickup, coordinate: trip.pickupCoordinate, distance: 0, eta: 0, badge: "AT PICKUP" };
    if (trip.status === "in_trip") return { target: "destination" as const, title: "Navigate to destination", destination: trip.destination, coordinate: trip.destinationCoordinate, distance: trip.tripDistanceKm, eta: trip.tripDurationMinutes, badge: "IN TRIP" };
    return { target: "destination" as const, title: trip.status === "completed" ? "Trip completed" : "Trip unavailable", destination: trip.destination, coordinate: trip.destinationCoordinate, distance: null, eta: null, badge: trip.status === "completed" ? "COMPLETED" : "ENDED" };
  }, [trip]);

  const mapsUrl = stage ? navigationUrl(stage.coordinate, stage.destination) : "";
  const canNavigate = trip?.status === "accepted" || trip?.status === "in_trip";
  const invalidTrip = trip?.status === "withdrawn" || trip?.status === "cancelled";
  const activeRoute =
    nativeRoute && nativeRoute.target === stage?.target ? nativeRoute : null;
  const nextGuidance = activeRoute?.steps[0];
  const guidanceTitle = nextGuidance?.instruction || (stage?.title ? op(stage.title) : op("Navigation"));
  const guidanceDistance =
    nextGuidance && nextGuidance.distanceMeters > 0
      ? metersLabel(nextGuidance.distanceMeters)
      : activeRoute
        ? metersLabel(activeRoute.distanceMeters)
        : distanceLabel(stage?.distance ?? null);
  const routeEtaMinutes =
    activeRoute
      ? Math.max(1, Math.round(activeRoute.durationSeconds / 60))
      : stage?.eta ?? null;

  async function transition(next: "arrived_pickup" | "in_trip" | "completed") {
    if (!trip || !driverId || busy) return;
    const valid =
      (trip.status === "accepted" && next === "arrived_pickup") ||
      (trip.status === "arrived_pickup" && next === "in_trip") ||
      (trip.status === "in_trip" && next === "completed");
    if (!valid) {
      setMessage("That trip action is no longer valid for the current stage.");
      return;
    }

    setBusy(true);
    setMessage("");
    const { data, error } = await supabase
      .from("ride_requests")
      .update({ status: next })
      .eq("id", trip.requestId)
      .eq("assigned_driver_id", driverId)
      .eq("status", trip.status)
      .select("status")
      .maybeSingle();

    if (error || !data) {
      setMessage(error?.message?.includes("INVALID_TRIP_STAGE_TRANSITION")
        ? "The trip stage changed before this action completed."
        : "NexRide could not update the trip stage. Check your connection and try again.");
      setBusy(false);
      return;
    }
    const status = normalizeStatus(data.status);
    if (status) setTrip((current) => current ? { ...current, status } : current);
    setBusy(false);
  }

  if (loading) return <main className="nr-app nr-driver-navigation-page" data-mode="driver" data-theme="dark"><div className="nr-nav-loading" aria-busy="true"><span /><span /><span /></div></main>;

  if (message && !trip) return (
    <main className="nr-app nr-driver-navigation-page" data-mode="driver" data-theme="dark">
      <section className="nr-nav-unavailable">
        <span><Icon name="info" size={25} /></span><h1>{op("Navigation unavailable")}</h1><p>{message}</p>
        <button onClick={() => router.replace("/driver/home")}>{op("Back to Driver Home")}</button>
      </section>
    </main>
  );

  if (!trip || !stage) return null;

  return (
    <main className="nr-app nr-driver-navigation-page" data-mode="driver" data-theme="dark">
      <DriverNavigationMap vehicle={position} pickup={trip.pickupCoordinate} destination={trip.destinationCoordinate} route={nativeRoute?.target === stage.target ? nativeRoute.geometry : []} target={stage.target} view={mapView} gpsState={gpsState} heading={position?.heading ?? null} />

      <button className="nr-nav-home" onClick={() => router.replace("/driver/home")} aria-label={op("Driver home")}><Icon name="home" size={19} /></button>

      <section className="nr-nav-guidance" aria-live="polite">
        <span className="nr-nav-guidance-icon"><Icon name="navigation" size={30} /></span>
        <div><small>{stage.badge}</small><strong>{guidanceTitle}</strong>{canNavigate && <em>{nativeRoute?.target === stage.target ? op("Route guidance") : op("Google Maps is also available")}</em>}</div>
        <span className="nr-nav-guidance-distance">{guidanceDistance}</span>
      </section>

      <div className="nr-nav-map-controls" aria-label="Map controls">
        <button onClick={() => setMapView("vehicle")} className={mapView === "vehicle" ? "active" : ""} disabled={!position} aria-label="Recenter on vehicle" aria-pressed={mapView === "vehicle"}><Icon name="locate" size={20} /></button>
        <button onClick={() => setMapView("overview")} className={mapView === "overview" ? "active" : ""} aria-label="Show route overview" aria-pressed={mapView === "overview"}><Icon name="globe" size={20} /></button>
        <button onClick={() => router.push(`/trip/chat?ride=${trip.requestId}&role=driver&offer=${trip.offerId}`)} aria-label={op("Open rider chat")}><Icon name="chat" size={20} /></button>
        <button onClick={() => router.push(`/safety?role=driver&ride=${trip.requestId}`)} aria-label={op("Open Safety Center")}><Icon name="shield" size={20} /></button>
      </div>

      {(gpsState !== "fresh" || routeNotice || locationShareError || nativeRouteNotice) && (
        <div className={`nr-nav-status ${gpsState === "lost" || locationShareError ? "danger" : gpsState === "stale" || nativeRouteNotice ? "warning" : ""}`}>
          <Icon name={gpsState === "fresh" && !locationShareError && !nativeRouteNotice ? "check" : "info"} size={16} />
          <span>{locationShareError || routeNotice || nativeRouteNotice || gpsMessage || op("Getting your location…")}</span>
        </div>
      )}

      <section className="nr-nav-bottom-card">
        <div className="nr-nav-trip-meta"><span>{trip.rideCategory}</span><span>{stage.badge}</span></div>
        <div className="nr-nav-current-destination">
          <small>{stage.target === "pickup" ? op("PICKUP") : op("DESTINATION")}</small>
          <h1>{stage.destination}</h1>
          <p>{routeEtaMinutes === null ? op("Arrival estimate unavailable") : routeEtaMinutes === 0 ? op("You are at this stop") : `Arriving in about ${routeEtaMinutes} min`}</p>
        </div>

        {message && <div className="nr-nav-action-error" role="alert"><Icon name="info" size={16} /><span>{message}</span></div>}

        {invalidTrip ? (
          <button className="nr-nav-stage-primary" onClick={() => router.replace("/driver/home")}>{op("Back to Driver Home")}</button>
        ) : trip.status === "accepted" ? (
          <div className="nr-nav-stage-actions">
            <a className="nr-nav-stage-primary" href={mapsUrl} target="_blank" rel="noreferrer"><Icon name="navigation" size={19} /> {op("Open Google Maps")}</a>
            <button className="nr-nav-stage-secondary" disabled={busy} onClick={() => transition("arrived_pickup")}>{busy ? op("Updating…") : op("Arrived at pickup")}</button>
          </div>
        ) : trip.status === "arrived_pickup" ? (
          <button className="nr-nav-stage-primary" disabled={busy} onClick={() => transition("in_trip")}><Icon name="navigation" size={19} /> {busy ? op("Starting…") : op("Start trip")}</button>
        ) : trip.status === "in_trip" ? (
          <div className="nr-nav-stage-actions">
            <a className="nr-nav-stage-primary" href={mapsUrl} target="_blank" rel="noreferrer"><Icon name="navigation" size={19} /> {op("Open Google Maps")}</a>
            <button className="nr-nav-stage-secondary complete" disabled={busy} onClick={() => transition("completed")}>{busy ? op("Completing…") : op("Complete trip")}</button>
          </div>
        ) : (
          <div className="nr-nav-stage-actions">
            <button className="nr-nav-stage-primary" onClick={() => router.replace("/driver/home?screen=earnings")}><Icon name="money" size={19} /> {op("View earnings")}</button>
            <button className="nr-nav-stage-secondary" onClick={() => router.replace("/driver/home")}><Icon name="home" size={18} /> Driver Home</button>
          </div>
        )}

        {canNavigate && <div className="nr-nav-handoff"><Icon name="info" size={15} /><span>{nativeRoute?.target === stage.target ? "NexRide keeps the route updated from your location. Google Maps is also available for turn-by-turn guidance." : "Route guidance is unavailable right now. Use Google Maps for turn-by-turn directions."}</span></div>}
      </section>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverNavigationMap, type NavigationCoordinate, type NavigationTrafficSegment } from "../../../components/nexride/driver-navigation-map";
import { DriverBottomSheet } from "../../../components/nexride/driver-bottom-sheet";
import { Icon } from "../../../components/nexride/ui";
import { useOperationalTranslation } from "../../../components/nexride/operational-i18n";
import { Dialog } from "../../../components/nexride/ui";
import { resolveDriverPassOutcome } from "../../../lib/nexride-driver-pass";
import { supabase } from "../../../lib/supabase";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import {
  emitNexRideFeedback, stopRideRequestAlert,
  isRideRequestSoundBlocked, primeNexRideAudio, RIDE_REQUEST_SOUND_STATE_EVENT,
} from "../../../lib/nexride-feedback";
import "../../nexride.css";
import "./driver-request.css";
import "../../detail-system.css";

type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

type RideOffer = {
  id: string;
  request_id: string;
  driver_id: string;
  status: OfferStatus;
  pickup_distance_km: number | null;
  pickup_eta_minutes: number | null;
  expires_at: string | null;
};

type RideRequest = {
  id: string;
  pickup_location: string;
  destination_location: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_lat: number | null;
  destination_lng: number | null;
  ride_category: string;
  estimated_trip_fare_etb: number | null;
  estimated_driver_payout_etb: number | null;
  estimated_trip_distance_km: number | null;
  estimated_trip_duration_minutes: number | null;
  status: string;
  assigned_driver_id: string | null;
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value);
}

function normalizedOffer(row: Record<string, unknown>): RideOffer {
  const rawStatus = typeof row.status === "string" ? row.status : "pending";
  const status: OfferStatus =
    rawStatus === "accepted" || rawStatus === "declined" || rawStatus === "withdrawn" || rawStatus === "expired"
      ? rawStatus
      : "pending";

  return {
    id: String(row.id || ""),
    request_id: String(row.request_id || ""),
    driver_id: String(row.driver_id || ""),
    status,
    pickup_distance_km: numberOrNull(row.pickup_distance_km),
    pickup_eta_minutes: numberOrNull(row.pickup_eta_minutes),
    expires_at: typeof row.expires_at === "string" ? row.expires_at : null,
  };
}

export default function DriverRideRequestPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const [driverId, setDriverId] = useState("");
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const [request, setRequest] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<"accept" | "decline" | "pass" | null>(null);
  const [confirmAction, setConfirmAction] = useState<"decline" | "pass" | null>(null);
  const [passOutcome, setPassOutcome] = useState<"forwarded" | "other_pending" | "no_drivers" | null>(null);
  const decisionLock = useRef(false);
  const [acceptFailure, setAcceptFailure] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [requestRoute, setRequestRoute] = useState<NavigationCoordinate[]>([]);
  const [requestSegments, setRequestSegments] = useState<NavigationTrafficSegment[]>([]);
  const [driverPosition, setDriverPosition] = useState<NavigationCoordinate | null>(null);
  const [driverHeading, setDriverHeading] = useState<number | null>(null);
  const [gpsState, setGpsState] = useState<"acquiring" | "fresh" | "stale" | "lost" | "unsupported">("acquiring");
  const [approachMeta, setApproachMeta] = useState<{
    distanceKm: number;
    etaMinutes: number;
    traffic: "low" | "moderate" | "heavy" | "severe" | null;
  } | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsState("unsupported");
      return;
    }
    let lastFix = 0;
    let lastPublished = 0;
    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        const now = Date.now();
        lastFix = result.timestamp || now;
        if (lastPublished && now - lastPublished < 8000) return;
        lastPublished = now;
        setDriverPosition({
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        });
        setDriverHeading(
          Number.isFinite(result.coords.heading ?? NaN)
            ? Number(result.coords.heading)
            : null,
        );
        setGpsState("fresh");
      },
      () => setGpsState("lost"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
    );
    const timer = window.setInterval(() => {
      if (lastFix && Date.now() - lastFix > 30000) setGpsState("stale");
    }, 5000);
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (
      !request ||
      !Number.isFinite(request.pickup_lat) ||
      !Number.isFinite(request.pickup_lng) ||
      !Number.isFinite(request.destination_lat) ||
      !Number.isFinite(request.destination_lng)
    ) {
      setRequestRoute([]);
      setRequestSegments([]);
      setApproachMeta(null);
      return;
    }
    const pickup = {
      lat: Number(request.pickup_lat),
      lng: Number(request.pickup_lng),
    };
    const destination = {
      lat: Number(request.destination_lat),
      lng: Number(request.destination_lng),
    };
    const start = driverPosition || pickup;
    const end = driverPosition ? pickup : destination;
    const controller = new AbortController();
    void fetch("/api/rider/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ pickup: start, destination: end }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then((response) => response.json())
      .then((body) => {
        const geometry = Array.isArray(body?.route?.geometry) ? body.route.geometry : [];
        const road = geometry
          .filter(
            (point: unknown) =>
              Array.isArray(point) &&
              point.length >= 2 &&
              Number.isFinite(Number(point[0])) &&
              Number.isFinite(Number(point[1])),
          )
          .map((point: [number, number]) => ({ lat: Number(point[0]), lng: Number(point[1]) }));
        setRequestRoute(road);
        const trafficSegments = Array.isArray(body?.route?.segments)
          ? body.route.segments.map((segment: Record<string, unknown>) => {
              const from = Array.isArray(segment.from) ? segment.from : [];
              const to = Array.isArray(segment.to) ? segment.to : [];
              const congestion = segment.congestion;
              if (from.length < 2 || to.length < 2) return null;
              const fromPoint = { lat: Number(from[0]), lng: Number(from[1]) };
              const toPoint = { lat: Number(to[0]), lng: Number(to[1]) };
              if (![fromPoint.lat, fromPoint.lng, toPoint.lat, toPoint.lng].every(Number.isFinite)) return null;
              return {
                from: fromPoint,
                to: toPoint,
                ...(congestion === "low" || congestion === "moderate" || congestion === "heavy" || congestion === "severe" ? { congestion } : {}),
              } as NavigationTrafficSegment;
            }).filter(Boolean) as NavigationTrafficSegment[]
          : [];
        setRequestSegments(trafficSegments);
        if (driverPosition && body?.status === "ready") {
          const meters = Number(body.route?.distanceMeters);
          const seconds = Number(body.route?.durationSeconds);
          const traffic = body.route?.traffic?.level;
          setApproachMeta(
            Number.isFinite(meters) && Number.isFinite(seconds)
              ? {
                  distanceKm: meters / 1000,
                  etaMinutes: Math.max(1, Math.round(seconds / 60)),
                  traffic:
                    traffic === "low" ||
                    traffic === "moderate" ||
                    traffic === "heavy" ||
                    traffic === "severe"
                      ? traffic
                      : null,
                }
              : null,
          );
        } else {
          setApproachMeta(null);
        }
      })
      .catch(() => {
        setRequestRoute([]);
        setRequestSegments([]);
        setApproachMeta(null);
      });
    return () => controller.abort();
  }, [request, driverPosition?.lat, driverPosition?.lng]);

  const loadOffer = useCallback(async (userId: string, offerId?: string | null) => {
    let query = supabase
      .from("ride_request_offers")
      .select("id,request_id,driver_id,status,pickup_distance_km,pickup_eta_minutes,expires_at")
      .eq("driver_id", userId);

    query = offerId
      ? query.eq("id", offerId)
      : query.eq("status", "pending").order("created_at", { ascending: false }).limit(1);

    const { data, error } = offerId ? await query.maybeSingle() : await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      setOffer(null);
      setRequest(null);
      return;
    }

    const nextOffer = normalizedOffer(data as Record<string, unknown>);
    setOffer(nextOffer);

    const { data: ride, error: rideError } = await supabase
      .from("ride_requests")
      .select("id,pickup_location,destination_location,pickup_lat,pickup_lng,destination_lat,destination_lng,ride_category,estimated_trip_fare_etb,estimated_driver_payout_etb,estimated_trip_distance_km,estimated_trip_duration_minutes,status,assigned_driver_id")
      .eq("id", nextOffer.request_id)
      .maybeSingle();

    if (rideError) throw rideError;
    setRequest((ride || null) as RideRequest | null);
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

      const userId = session.user.id;
      setDriverId(userId);

      const { data: driver } = await supabase
        .from("drivers")
        .select("review_status,is_online")
        .eq("id", userId)
        .maybeSingle();

      if (!driver || driver.review_status !== "approved") {
        router.replace("/driver/verification");
        return;
      }

      const offerId = new URLSearchParams(window.location.search).get("offer");

      try {
        await loadOffer(userId, offerId);
      } catch {
        setAcceptFailure("NexRide could not load this ride request. Check your connection and try again.");
      } finally {
        if (active) setLoading(false);
      }

      channel = supabase
        .channel(`ride-offers-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ride_request_offers", filter: `driver_id=eq.${userId}` },
          async (payload) => {
            if (!active) return;
            const row = payload.new as Record<string, unknown>;
            const changedId = typeof row?.id === "string" ? row.id : offerId;
            try {
              await loadOffer(userId, changedId);
            } catch {
              setAcceptFailure("Ride request status could not be refreshed.");
            }
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadOffer, router]);

  useEffect(() => {
    if (!offer?.expires_at || offer.status !== "pending") {
      setSecondsRemaining(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(offer.expires_at!).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
    };

    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [offer?.expires_at, offer?.status]);

  useEffect(() => {
    const sync = () => setSoundBlocked(isRideRequestSoundBlocked());
    window.addEventListener(RIDE_REQUEST_SOUND_STATE_EVENT, sync);
    sync();
    return () => window.removeEventListener(RIDE_REQUEST_SOUND_STATE_EVENT, sync);
  }, []);

  useEffect(() => {
    // Do not stop a Dashboard-started ringtone before this page has loaded
    // the offer. Its global timer owns the entire 30-second window.
    if (!offer?.id) return;
    const expiry = offer.expires_at ? Date.parse(offer.expires_at) : NaN;
    if (offer.status !== "pending" || (Number.isFinite(expiry) && expiry <= Date.now())) {
      stopRideRequestAlert(offer.id);
      return;
    }
    emitNexRideFeedback({
      event: "ride_request",
      id: offer.id,
      expiresAt: offer.expires_at,
      title: "New ride request",
      body: "Review the pickup, destination, ETA and payout.",
      url: `/driver/request?offer=${offer.id}`,
    });
    // Re-rendering/unmounting does not end a still-pending ride's audio.
  }, [offer?.id, offer?.status, offer?.expires_at]);

    const expiredByTime = offer?.status === "pending" && secondsRemaining === 0;
  const visibleStatus: OfferStatus | "failed" =
    acceptFailure && offer?.status === "pending" && !expiredByTime
      ? "failed"
      : expiredByTime
        ? "expired"
        : offer?.status || "pending";

  const fare = useMemo(() => {
    if (!request) return null;
    if (request.estimated_driver_payout_etb !== null) {
      return { label: op("Estimated driver payout"), value: request.estimated_driver_payout_etb };
    }
    if (request.estimated_trip_fare_etb !== null) {
      return { label: op("Estimated trip fare"), value: request.estimated_trip_fare_etb };
    }
    return null;
  }, [request]);

  async function acceptRide() {
    if (!offer || submitting || decisionLock.current || visibleStatus !== "pending") return;
    decisionLock.current = true;
    setConfirmAction(null);
    setSubmitting("accept");
    setAcceptFailure("");

    const { data, error } = await supabase
      .from("ride_request_offers")
      .update({ status: "accepted" })
      .eq("id", offer.id)
      .eq("driver_id", driverId)
      .eq("status", "pending")
      .select("status")
      .maybeSingle();

    if (error || !data) {
      const message = error?.message || "";
      if (message.includes("RIDE_OFFER_EXPIRED")) {
        setOffer((current) => current ? { ...current, status: "expired" } : current);
      } else if (message.includes("RIDE_REQUEST_UNAVAILABLE") || error?.code === "23505") {
        setOffer((current) => current ? { ...current, status: "withdrawn" } : current);
      } else if (message.includes("DRIVER_NOT_ELIGIBLE")) {
        setAcceptFailure(op("Your driver account is not currently eligible to accept rides. Check verification and availability."));
      } else {
        setAcceptFailure(op("Acceptance failed. The request may have changed or your connection may be unavailable."));
      }
      setSubmitting(null);
      decisionLock.current = false;
      return;
    }

    stopRideRequestAlert(offer.id);
    decisionLock.current = false;
    emitNexRideFeedback({
      event: "ride_accepted",
      id: offer.id,
      title: "Ride accepted",
      body: "Navigate to the pickup point.",
      url: `/driver/navigation?offer=${offer.id}`,
    });
    setOffer((current) => current ? { ...current, status: "accepted" } : current);
    router.replace(`/driver/navigation?offer=${offer.id}`);
  }

  async function declineRide() {
    if (!offer || submitting || decisionLock.current || visibleStatus !== "pending") return;
    decisionLock.current = true;
    setSubmitting("decline");
    setAcceptFailure("");

    const { data, error } = await supabase
      .from("ride_request_offers")
      .update({ status: "declined" })
      .eq("id", offer.id)
      .eq("driver_id", driverId)
      .eq("status", "pending")
      .select("status")
      .maybeSingle();

    if (error || !data) {
      setAcceptFailure(op("NexRide could not decline this request. Its status may already have changed."));
      setSubmitting(null);
      decisionLock.current = false;
      setConfirmAction(null);
      return;
    }

    stopRideRequestAlert(offer.id);
    setConfirmAction(null);
    setPassOutcome(null);
    setOffer((current) => current ? { ...current, status: "declined" } : current);
    setSubmitting(null);
    decisionLock.current = false;
  }

  async function passRide() {
    if (!offer || submitting || decisionLock.current || visibleStatus !== "pending") return;
    decisionLock.current = true;
    setSubmitting("pass");
    setAcceptFailure("");
    try {
      // Authenticated RPC performs the decline and next-driver dispatch in
      // one transaction. A rejected/expired offer cannot be passed.
      const { data, error } = await supabase.rpc("driver_pass_ride_offer", {
        p_offer_id: offer.id,
      });
      const response = data as {
        status?: string; requestId?: string; forwarded?: boolean;
        anotherOfferActive?: boolean; currentStatus?: string;
      } | null;
      const outcome = error ? null : resolveDriverPassOutcome(response, offer.request_id);
      if (!outcome) {
        if (response?.status === "expired") {
          setOffer(current => current ? { ...current, status: "expired" } : current);
        } else if (response?.status === "unavailable" || response?.status === "already_resolved") {
          await loadOffer(driverId, offer.id).catch(() => {});
        }
        setAcceptFailure(op("Could not pass this request. Check the latest status and try again."));
        return;
      }
      stopRideRequestAlert(offer.id);
      setPassOutcome(outcome);
      setOffer(current => current ? { ...current, status: "declined" } : current);
    } catch {
      setAcceptFailure(op("Could not pass this request. Check your connection and try again."));
    } finally {
      decisionLock.current = false;
      setSubmitting(null);
      setConfirmAction(null);
    }
  }

  return (
    <main className="nr-app nr-driver-request-page" data-mode="driver">
      {confirmAction && offer?.status === "pending" && (
        <Dialog
          title={op(confirmAction === "pass" ? "Pass this ride to another driver?" : "Decline this ride?")}
          onClose={() => { if (!submitting) setConfirmAction(null); }}
        >
          <div className="nr-request-confirm-content">
            <p>{op(confirmAction === "pass"
              ? "Your offer will be released. NexRide will try another available driver and keep the rider searching."
              : "Are you sure you want to decline this request? The rider's ride will not be cancelled.")}</p>
            <div className="nr-request-confirm-actions">
              <button type="button" className="nr-request-confirm-no"
                disabled={Boolean(submitting)}
                onClick={() => setConfirmAction(null)}>{op("No, Keep Request")}</button>
              <button type="button" className="nr-request-confirm-yes"
                disabled={Boolean(submitting)}
                onClick={() => void (confirmAction === "pass" ? passRide() : declineRide())}>
                {submitting ? op("Processing…") : op(confirmAction === "pass" ? "Yes, Pass Ride" : "Yes, Decline")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {offer?.status === "pending" && soundBlocked && (
        <button
          type="button"
          className="nr-driver-request-unmute"
          onClick={() => { void primeNexRideAudio(); }}
          aria-label={op("Enable incoming ride request sound")}
        >
          {op("Tap to enable the 30-second ride request sound")}
        </button>
      )}
      <div className="nr-driver-request-map">
        <DriverNavigationMap
          vehicle={driverPosition}
          pickup={
            request && Number.isFinite(request.pickup_lat) && Number.isFinite(request.pickup_lng)
              ? { lat: Number(request.pickup_lat), lng: Number(request.pickup_lng) }
              : null
          }
          destination={
            request &&
            Number.isFinite(request.destination_lat) &&
            Number.isFinite(request.destination_lng)
              ? { lat: Number(request.destination_lat), lng: Number(request.destination_lng) }
              : null
          }
          route={requestRoute}
          segments={requestSegments}
          target="pickup"
          view="overview"
          gpsState={gpsState}
          heading={driverHeading}
        />
      </div>

      <button className="nr-request-back" onClick={() => router.replace("/driver/home")} aria-label={op("Back to driver home")}>
        <Icon name="back" />
      </button>

      <DriverBottomSheet className="nr-request-sheet" label="Ride request details" defaultSnap="medium">

        {loading ? (
          <div className="nr-request-loading" aria-busy="true">
            <span /><span /><span /><span />
          </div>
        ) : !offer || !request ? (
          <RequestState
            icon="navigation"
            title={op("No active ride request")}
            body={op("New ride requests will appear here when NexRide dispatch sends one to you.")}
            action={op("Back to Driver Home")}
            onAction={() => router.replace("/driver/home")}
          />
        ) : visibleStatus === "accepted" ? (
          <RequestState
            icon="navigation"
            title={op("Ride accepted")}
            body={op("The ride is assigned to you. Continue to pickup navigation.")}
            action={op("Navigate to pickup")}
            onAction={() => router.replace(`/driver/navigation?offer=${offer.id}`)}
          />
        ) : visibleStatus === "expired" ? (
          <RequestState
            icon="clock"
            title={op("Request expired")}
            body={op("The acceptance window has ended. You won’t be assigned this ride.")}
            action={op("Back to Driver Home")}
            onAction={() => router.replace("/driver/home")}
          />
        ) : visibleStatus === "withdrawn" ? (
          <RequestState
            icon="info"
            title={op("Ride no longer available")}
            body={op("Another driver may have accepted this ride first, or the request was withdrawn.")}
            action={op("Back to Driver Home")}
            onAction={() => router.replace("/driver/home")}
          />
        ) : visibleStatus === "declined" ? (
          <RequestState
            icon="check"
            title={op(passOutcome ? "Ride passed" : "Ride declined")}
            body={op(passOutcome === "forwarded"
              ? "NexRide sent this ride request to another available driver."
              : passOutcome === "other_pending"
                ? "Another driver has an active offer for this ride."
                : passOutcome === "no_drivers"
                  ? "No additional driver is available yet. The rider can continue searching."
                  : "You declined this request. NexRide can send another request while you remain online.")}
            action={op("Back to Driver Home")}
            onAction={() => router.replace("/driver/home")}
          />
        ) : (
          <>
            <div className="nr-request-heading">
              <div>
                <span className="nr-request-eyebrow">NEW REQUEST</span>
                <h1>New ride request</h1>
              </div>
              {offer.expires_at && secondsRemaining !== null && (
                <div className="nr-request-countdown" aria-label={`${secondsRemaining} seconds remaining`}>
                  <Icon name="clock" size={15} />
                  <strong>{secondsRemaining}s</strong>
                </div>
              )}
            </div>

            {(approachMeta || offer.pickup_distance_km !== null || offer.pickup_eta_minutes !== null) && (
              <div className="nr-request-approach" data-traffic={approachMeta?.traffic || "unavailable"}>
                <Icon name="navigation" size={15} />
                <strong>
                  {(approachMeta?.distanceKm ?? offer.pickup_distance_km) !== null
                    ? `${(approachMeta?.distanceKm ?? offer.pickup_distance_km)!.toFixed(1)} km`
                    : op("Distance unavailable")}
                </strong>
                <span>•</span>
                <span>
                  {(approachMeta?.etaMinutes ?? offer.pickup_eta_minutes) !== null
                    ? `${Math.max(1, Math.round((approachMeta?.etaMinutes ?? offer.pickup_eta_minutes)!))} min to pickup`
                    : op("ETA unavailable")}
                </span>
                {approachMeta?.traffic && (
                  <span className="nr-request-traffic">
                    <i aria-hidden="true" />
                    {op(
                      approachMeta.traffic === "low"
                        ? "Light traffic"
                        : approachMeta.traffic === "moderate"
                          ? "Moderate traffic"
                          : approachMeta.traffic === "heavy"
                            ? "Heavy traffic"
                            : "Severe traffic",
                    )}
                  </span>
                )}
              </div>
            )}

            <div className="nr-request-route">
              <div className="nr-request-route-line"><span className="dot pickup" /><i /></div>
              <div className="nr-request-route-copy">
                <div><small>Pickup</small><strong>{request.pickup_location}</strong></div>
                <div><small>Destination</small><strong>{request.destination_location}</strong></div>
              </div>
            </div>

            <div className="nr-request-summary">
              <div><small>Ride</small><strong>{request.ride_category}</strong></div>
              <div>
                <small>{fare?.label || "Estimated fare"}</small>
                <strong>{fare ? `${formatMoney(fare.value)} ETB` : "Not provided"}</strong>
              </div>
              {request.estimated_trip_distance_km !== null && (
                <div><small>Trip distance</small><strong>{request.estimated_trip_distance_km.toFixed(1)} km</strong></div>
              )}
              {request.estimated_trip_duration_minutes !== null && (
                <div><small>Estimated trip time</small><strong>{Math.max(1, Math.round(request.estimated_trip_duration_minutes))} min</strong></div>
              )}
            </div>

            {acceptFailure && (
              <div className="nr-request-error" role="alert">
                <Icon name="info" size={17} />
                <span>{acceptFailure}</span>
              </div>
            )}

            <div className="nr-request-actions" aria-label={op("Respond to ride request")}>
              <div className="nr-request-actions-primary">
                <button type="button" className="nr-request-accept"
                  disabled={Boolean(submitting)} onClick={() => void acceptRide()}>
                  <Icon name="check" size={18} />
                  {submitting === "accept" ? op("Accepting…") : op("Accept")}
                </button>
                <button type="button" className="nr-request-decline"
                  disabled={Boolean(submitting)} onClick={() => setConfirmAction("decline")}>
                  <Icon name="close" size={18} />
                  {op("Decline")}
                </button>
              </div>
              <button type="button" className="nr-request-pass"
                disabled={Boolean(submitting)} onClick={() => setConfirmAction("pass")}>
                <Icon name="arrow" size={18} />
                {op("Pass to Another Driver")}
              </button>
            </div>
          </>
        )}
      </DriverBottomSheet>
    </main>
  );
}

function RequestState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: "navigation" | "clock" | "info" | "check";
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="nr-request-state">
      <span><Icon name={icon} size={24} /></span>
      <h1>{title}</h1>
      <p>{body}</p>
      <button onClick={onAction}>{action}</button>
    </div>
  );
}

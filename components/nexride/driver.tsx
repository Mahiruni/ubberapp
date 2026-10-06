"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import { RiderMap } from "./rider-map";
import { useRiderLocation } from "../../lib/nexride-location";
import { DriverEarningsScreen } from "./driver-earnings";
import { DriverProfileScreen } from "./driver-profile";
import { loadDriverEarningsReport } from "../../lib/nexride-driver-earnings";
import { supabase } from "../../lib/supabase";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import "../../app/driver/driver-dashboard.css";
import "../../app/rider-home.css";

export type DriverScreen = "home" | "earnings" | "map" | "profile";
type ReviewStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
type LocationPermission = "checking" | "granted" | "prompt" | "denied" | "unsupported";

type DriverState = {
  name: string;
  avatarUrl: string;
  online: boolean;
  reviewStatus: ReviewStatus;
  rejectionReason: string;
  rating: number | null;
  earnings: number | null;
  trips: number | null;
  activeTrip: { pickup: string; destination: string; status: string } | null;
};

const emptyState: DriverState = {
  name: "Driver",
  avatarUrl: "",
  online: false,
  reviewStatus: "draft",
  rejectionReason: "",
  rating: null,
  earnings: null,
  trips: null,
  activeTrip: null,
};

const str = (value: unknown) => typeof value === "string" ? value : "";
const num = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

function normalizeReviewStatus(value: unknown): ReviewStatus {
  return value === "pending" || value === "approved" || value === "rejected" || value === "suspended"
    ? value
    : "draft";
}

function mergeDriverState(current: DriverState, record: Record<string, unknown> | null): DriverState {
  if (!record) return current;
  return {
    ...current,
    online: record.is_online === true,
    reviewStatus: normalizeReviewStatus(record.review_status),
    rejectionReason: str(record.rejection_reason),
    rating: num(record.rating),
  };
}

function formatEarnings(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("en-ET", { maximumFractionDigits: 0 }).format(value);
}

function driverErrorTitle(message: string) {
  const value = message.toLowerCase();
  if (value.includes("location") || value.includes("gps")) return "Location needs attention";
  if (value.includes("session") || value.includes("sign in")) return "Driver session needs attention";
  if (value.includes("verification") || value.includes("approval")) return "Verification status changed";
  if (value.includes("account")) return "Driver account unavailable";
  if (value.includes("connection") || value.includes("network")) return "Connection unavailable";
  return "Availability update failed";
}

function verificationCopy(status: ReviewStatus, rejectionReason: string) {
  if (status === "pending") {
    return {
      tone: "pending",
      title: "Verification pending",
      body: "Your driver documents are being reviewed. You can go online after approval.",
      action: "Refresh status",
    };
  }
  if (status === "rejected") {
    return {
      tone: "error",
      title: "Verification needs attention",
      body: rejectionReason || "Update the requested driver documents before going online.",
      action: "Update documents",
    };
  }
  if (status === "suspended") {
    return {
      tone: "blocked",
      title: "Driver access suspended",
      body: "Your account is not eligible to go online. Review your verification status or contact NexRide support.",
      action: "Review account",
    };
  }
  return {
    tone: "pending",
    title: "Complete driver verification",
    body: "Submit your driver license and vehicle registration before going online.",
    action: "Complete verification",
  };
}

export function DriverWorkspace({
  screen,
  navigate,
  onSafety,
}: {
  screen: DriverScreen;
  navigate: (screen: DriverScreen) => void;
  onSafety: () => void;
}) {
  const router = useRouter();
  const [state, setState] = useState<DriverState>(emptyState);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [locationPermission, setLocationPermission] = useState<LocationPermission>("checking");
  const mapLocation = useRiderLocation();

  const refreshDriverStatus = async (id = driverId) => {
    if (!id) return null;
    const { data, error: refreshError } = await supabase
      .from("drivers")
      .select("review_status,rejection_reason,is_online,rating")
      .eq("id", id)
      .maybeSingle();

    if (refreshError || !data) return null;
    setState((current) => mergeDriverState(current, data as Record<string, unknown>));
    return data;
  };

  useEffect(() => {
    let active = true;
    let driverChannel: ReturnType<typeof supabase.channel> | null = null;
    let offerChannel: ReturnType<typeof supabase.channel> | null = null;
    let earningsChannel: ReturnType<typeof supabase.channel> | null = null;
    let tripsChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError || !data.session) {
        setError("Your driver session could not be restored.");
        setLoading(false);
        return;
      }

      const accountRole = await resolveSessionRole(data.session);
      if (!active) return;

      if (accountRole !== "driver") {
        router.replace(accountRole === "admin" ? "/admin" : "/");
        return;
      }

      const metadata = data.session.user.user_metadata || {};
      const base: DriverState = {
        ...emptyState,
        name: str(metadata.full_name) || str(metadata.name) || "Driver",
        avatarUrl: str(metadata.avatar_url) || str(metadata.avatarUrl),
      };

      const id = data.session.user.id;
      setDriverId(id);

      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .select("review_status,rejection_reason,is_online,rating")
        .eq("id", id)
        .maybeSingle();

      if (!active) return;

      if (driverError) {
        setError("Unable to load your live driver status.");
      }

      setState(mergeDriverState(base, driver as Record<string, unknown> | null));
      setLoading(false);

      const refreshTodaySummary = async () => {
        try {
          const report = await loadDriverEarningsReport(id, "today");
          if (!active) return;
          setState((current) => ({
            ...current,
            earnings: report.netDriverEarningsEtb,
            trips: report.completedTrips,
          }));
        } catch {
          if (!active) return;
          setState((current) => ({ ...current, earnings: null, trips: null }));
        }
      };

      void refreshTodaySummary();

      driverChannel = supabase
        .channel(`driver-dashboard-${id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${id}` },
          (payload) => setState((current) => mergeDriverState(current, payload.new as Record<string, unknown>)),
        )
        .subscribe();

      const { data: acceptedOffer } = await supabase
        .from("ride_request_offers")
        .select("id,request_id")
        .eq("driver_id", id)
        .eq("status", "accepted")
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active && acceptedOffer) {
        const { data: activeRide } = await supabase
          .from("ride_requests")
          .select("status")
          .eq("id", acceptedOffer.request_id)
          .maybeSingle();

        if (
          activeRide &&
          activeRide.status !== "completed" &&
          activeRide.status !== "cancelled" &&
          activeRide.status !== "withdrawn"
        ) {
          router.push(`/driver/navigation?offer=${acceptedOffer.id}`);
          return;
        }
      }

      const { data: pendingOffer } = await supabase
        .from("ride_request_offers")
        .select("id,expires_at")
        .eq("driver_id", id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (
        active &&
        pendingOffer &&
        (!pendingOffer.expires_at || new Date(pendingOffer.expires_at).getTime() > Date.now())
      ) {
        router.push(`/driver/request?offer=${pendingOffer.id}`);
      }

      earningsChannel = supabase
        .channel(`driver-home-earnings-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "driver_earnings_ledger", filter: `driver_id=eq.${id}` },
          () => { void refreshTodaySummary(); },
        )
        .subscribe();

      tripsChannel = supabase
        .channel(`driver-home-trips-${id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "ride_requests", filter: `assigned_driver_id=eq.${id}` },
          () => { void refreshTodaySummary(); },
        )
        .subscribe();

      offerChannel = supabase
        .channel(`driver-ride-offers-${id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ride_request_offers", filter: `driver_id=eq.${id}` },
          (payload) => {
            const next = payload.new as Record<string, unknown>;
            if (next.status !== "pending" || typeof next.id !== "string") return;
            const expiresAt = typeof next.expires_at === "string" ? new Date(next.expires_at).getTime() : null;
            if (expiresAt !== null && expiresAt <= Date.now()) return;
            router.push(`/driver/request?offer=${next.id}`);
          },
        )
        .subscribe();
    })().catch(() => {
      if (active) {
        setError("Unable to load driver data.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
      if (driverChannel) supabase.removeChannel(driverChannel);
      if (offerChannel) supabase.removeChannel(offerChannel);
      if (earningsChannel) supabase.removeChannel(earningsChannel);
      if (tripsChannel) supabase.removeChannel(tripsChannel);
    };
  }, [router]);

  useEffect(() => {
    if (!driverId) return;

    const refresh = () => {
      void refreshDriverStatus(driverId);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const timer =
      state.reviewStatus === "approved"
        ? undefined
        : window.setInterval(refresh, 12000);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) window.clearInterval(timer);
    };
  }, [driverId, state.reviewStatus]);

  useEffect(() => {
    let permission: PermissionStatus | null = null;
    let active = true;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationPermission("unsupported");
      return;
    }

    if (!navigator.permissions) {
      setLocationPermission("prompt");
      return;
    }

    navigator.permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (!active) return;
        permission = status;
        const sync = () => setLocationPermission(status.state);
        sync();
        status.onchange = sync;
      })
      .catch(() => active && setLocationPermission("prompt"));

    return () => {
      active = false;
      if (permission) permission.onchange = null;
    };
  }, []);

  useEffect(() => {
    if (!driverId || !state.online || (locationPermission !== "denied" && locationPermission !== "unsupported")) return;

    void (async () => {
      try {
        const response = await nexrideApiFetch("/api/driver/availability", {
          method: "PATCH",
          body: JSON.stringify({ online: false }),
        });
        if (!response.ok) throw new Error("offline_failed");
        const payload = await response.json();
        if (payload?.driver) {
          setState((current) => mergeDriverState(current, payload.driver as Record<string, unknown>));
        } else {
          setState((current) => ({ ...current, online: false }));
        }
      } catch {
        setError("Location access was lost. Go offline and restore location access.");
      }
    })();
  }, [driverId, locationPermission, state.online]);

  useEffect(() => {
    if (!driverId || !state.online || typeof navigator === "undefined" || !navigator.geolocation) return;

    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSent < 12000) return;
        lastSent = now;
        void (async () => {
          try {
            await nexrideApiFetch("/api/driver/availability", {
              method: "PATCH",
              body: JSON.stringify({
                location: {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                  accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
                },
              }),
            });
          } catch {}
        })();
      },
      (positionError) => {
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setLocationPermission("denied");
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 12000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [driverId, state.online]);

  const firstName = useMemo(() => state.name.trim().split(/\s+/)[0] || "Driver", [state.name]);
  const initials = useMemo(
    () => state.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR",
    [state.name],
  );

  const verified = state.reviewStatus === "approved";
  const locationReady = locationPermission === "granted";
  const canGoOnline = verified && locationReady;

  const block = useMemo(() => {
    if (!verified) return verificationCopy(state.reviewStatus, state.rejectionReason);
    if (locationPermission === "checking") {
      return {
        tone: "pending",
        title: "Checking location access",
        body: "NexRide is checking the location permission required for driver availability.",
        action: "",
      };
    }
    if (locationPermission === "denied") {
      return {
        tone: "blocked",
        title: "Location permission required",
        body: "Location access is blocked. Enable it for NexRide in your browser or device settings before going online.",
        action: "Try location again",
      };
    }
    if (locationPermission === "unsupported") {
      return {
        tone: "blocked",
        title: "Location unavailable",
        body: "This browser or device cannot provide the location access required for driver availability.",
        action: "",
      };
    }
    if (locationPermission === "prompt") {
      return {
        tone: "pending",
        title: "Enable driver location",
        body: "NexRide needs location access while you are available for ride requests.",
        action: "Enable location",
      };
    }
    return null;
  }, [locationPermission, state.rejectionReason, state.reviewStatus, verified]);

  const currentPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("unsupported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 },
      );
    });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationPermission("unsupported");
      return;
    }

    setError("");
    setLocationPermission("checking");

    currentPosition()
      .then(() => {
        setLocationPermission("granted");
        mapLocation.locate();
      })
      .catch((positionError: GeolocationPositionError | Error) => {
        if ("code" in positionError && positionError.code === positionError.PERMISSION_DENIED) {
          setLocationPermission("denied");
          setError("Location permission is blocked. Enable it in your browser or device settings, then try again.");
        } else {
          setLocationPermission("prompt");
          setError("NexRide could not get your location. Check GPS and try again.");
        }
      });
  };

  const resolveBlock = () => {
    if (state.reviewStatus === "pending") {
      setUpdating(true);
      setError("");
      void refreshDriverStatus()
        .then((fresh) => {
          if (fresh?.review_status === "approved") {
            setError("");
          }
        })
        .finally(() => setUpdating(false));
      return;
    }
    if (!verified) {
      router.push("/driver/verification");
      return;
    }
    if (locationPermission === "prompt" || locationPermission === "denied") {
      requestLocation();
    }
  };

  const toggleAvailability = async () => {
    if (!driverId || updating) return;
    if (!state.online && !canGoOnline) return;

    setUpdating(true);
    setError("");

    const nextOnline = !state.online;
    let location: Record<string, unknown> | undefined;

    if (nextOnline) {
      try {
        const position = await currentPosition();
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          updated_at: new Date(position.timestamp || Date.now()).toISOString(),
        };
        setLocationPermission("granted");
        mapLocation.locate();
      } catch (positionError) {
        if (
          typeof positionError === "object" &&
          positionError &&
          "code" in positionError &&
          (positionError as GeolocationPositionError).code === 1
        ) {
          setLocationPermission("denied");
          setError("Location permission is blocked. Enable it before going online.");
        } else {
          setError("NexRide could not confirm your current location. Check GPS and try again.");
        }
        setUpdating(false);
        return;
      }
    }

    try {
      const response = await nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({
          online: nextOnline,
          ...(location ? { location } : {}),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (payload?.status === "driver_not_approved") {
          await refreshDriverStatus();
          setError("Your latest verification status was refreshed. You can go online as soon as approval is active.");
        } else if (payload?.status === "account_inactive") {
          setError("This driver account is not active. Contact NexRide support.");
        } else if (payload?.status === "location_required") {
          setError("NexRide needs your current location before you can go online.");
        } else if (payload?.status === "unauthorized") {
          setError("Your Driver session expired. Sign in again to change availability.");
        } else if (payload?.status === "driver_required") {
          setError("This signed-in account is not registered as a Driver.");
        } else if (payload?.status === "driver_status_unavailable") {
          setError("NexRide could not read your Driver status. Refresh and try again.");
        } else if (payload?.status === "availability_update_failed") {
          setError("NexRide could not save your availability. Your current status was not changed.");
        } else if (payload?.status === "availability_service_unavailable") {
          setError("The Driver availability service is temporarily unavailable. Try again shortly.");
        } else {
          setError("NexRide could not update availability. Refresh your Driver status and try again.");
        }
      } else if (payload?.driver) {
        setState((current) => mergeDriverState(current, payload.driver as Record<string, unknown>));
      }
    } catch {
      setError("Availability could not be updated. Check your connection and try again.");
    } finally {
      setUpdating(false);
    }
  };

  if (screen === "earnings") {
    return (
      <div className="nr-driver-page">
        <DriverEarningsScreen
          driverId={driverId}
          onBack={() => navigate("home")}
          onOpenReport={() => router.push("/driver/earnings/report")}
        />
        <DriverBottomNav screen={screen} navigate={navigate} />
      </div>
    );
  }

  if (screen === "map") {
    return (
      <div className="nr-driver-page nr-driver-map-page">
        <header className="nr-driver-map-header">
          <div>
            <span className="nr-driver-kicker">NEXRIDE DRIVER</span>
            <h1>Driver map</h1>
            <p>{state.online ? "You’re online and visible for eligible dispatch." : "Go online when you’re ready to receive requests."}</p>
          </div>
          <button className="nr-driver-icon-btn" onClick={() => navigate("profile")} aria-label="Open driver profile">
            <Icon name="user" />
          </button>
        </header>

        <section className="nr-driver-live-map-shell" aria-label="Driver live map">
          <RiderMap
            position={mapLocation.position}
            status={mapLocation.status}
            locate={mapLocation.locate}
            recenter={mapLocation.recenter}
            initials={initials}
            onProfile={() => navigate("profile")}
            locked={loading}
            readOnly
            topLabel={state.online ? "ONLINE" : "OFFLINE"}
          />

          <div className="nr-driver-map-float">
            <div className="nr-driver-map-state">
              <span className={`nr-status-dot ${state.online ? "online" : "offline"}`} aria-hidden="true" />
              <div>
                <strong>{state.online ? "Online" : "Offline"}</strong>
                <span>
                  {mapLocation.status === "ready"
                    ? "Current location centered on the same NexRide map used by Riders."
                    : mapLocation.status === "denied"
                      ? "Location permission is blocked on this device."
                      : "Use the locate button to center your current position."}
                </span>
              </div>
            </div>
            <button
              className={`nr-driver-primary ${state.online ? "secondary-state" : ""}`}
              disabled={loading || updating || (!state.online && !canGoOnline)}
              onClick={toggleAvailability}
            >
              {updating ? "Updating…" : state.online ? "Go Offline" : "Go Online"}
            </button>
          </div>
        </section>

        <DriverBottomNav screen={screen} navigate={navigate} />
      </div>
    );
  }

  if (screen === "profile") {
    return (
      <div className="nr-driver-page">
        <DriverProfileScreen
          driverId={driverId}
          onBack={() => navigate("home")}
          onSafety={onSafety}
        />
        <DriverBottomNav screen={screen} navigate={navigate} />
      </div>
    );
  }

  return (
    <div className="nr-driver-page">
      <header className="nr-driver-header">
        <div className="nr-driver-brand-pill"><Icon name="car" size={15} /><span>NexRide Driver</span></div>
        <div className="nr-driver-avatar">{state.avatarUrl ? <img src={state.avatarUrl} alt="" /> : initials}</div>
        <div>
          <span className="nr-driver-kicker">DRIVER HOME</span>
          <h1>Good day, {firstName}</h1>
          <p>Ready when you are.</p>
        </div>
        <button className="nr-driver-icon-btn" onClick={() => navigate("profile")} aria-label="Open driver profile"><Icon name="user" /></button>
      </header>

      <section className={`nr-driver-operational-map ${state.online ? "is-online" : ""}`} aria-label="Driver operational map">
        <RiderMap
          position={mapLocation.position}
          status={mapLocation.status}
          locate={mapLocation.locate}
          recenter={mapLocation.recenter}
          initials={initials}
          onProfile={() => navigate("profile")}
          locked={loading}
          readOnly
          topLabel={state.online ? "ONLINE" : "OFFLINE"}
        />
        <div className="nr-driver-operational-card">
          <div className="nr-driver-operational-status">
            <span className={`nr-status-dot ${state.online ? "online" : "offline"}`} aria-hidden="true" />
            <div>
              <small>DRIVER AVAILABILITY</small>
              <strong>{state.online ? "Online" : "Offline"}</strong>
              <span>
                {state.online
                  ? "Visible for eligible dispatch. NexRide keeps your current location fresh while you’re available."
                  : verified
                    ? "Go online when you’re ready to receive requests."
                    : "Complete Driver eligibility before going online."}
              </span>
            </div>
          </div>
          <button
            className={`nr-driver-primary ${state.online ? "secondary-state" : ""}`}
            disabled={loading || updating || (!state.online && !canGoOnline)}
            onClick={toggleAvailability}
          >
            {updating ? "Updating…" : state.online ? "Go Offline" : "Go Online"}
          </button>
        </div>
      </section>

      {error && <div className="nr-driver-notice error" role="alert"><Icon name="info" /><div><strong>{driverErrorTitle(error)}</strong><span>{error}</span></div></div>}

      {!loading && block && (
        <div className={`nr-driver-notice ${block.tone}`}>
          <Icon name={verified ? "navigation" : "shield"} />
          <div><strong>{block.title}</strong><span>{block.body}</span></div>
          {block.action && <button onClick={resolveBlock}>{block.action}</button>}
        </div>
      )}

      <div className="nr-driver-metric-grid" aria-label="Driver summary">
        <Metric label="Today’s earnings" value={state.earnings === null ? "—" : formatEarnings(state.earnings)} suffix="ETB" hint={state.earnings === null ? "Unavailable" : "Today"} loading={loading} />
        <Metric label="Completed trips" value={state.trips === null ? "—" : String(state.trips)} hint={state.trips === null ? "Unavailable" : "Today"} loading={loading} />
        <Metric label="Rating" value={state.rating === null ? "—" : state.rating.toFixed(1)} suffix={state.rating === null ? "" : "★"} hint={state.rating === null ? "No rating yet" : "Driver rating"} loading={loading} />
      </div>

      {loading ? (
        <section className="nr-driver-card nr-driver-loading">
          <span className="nr-driver-skeleton wide" />
          <span className="nr-driver-skeleton" />
          <span className="nr-driver-skeleton" />
        </section>
      ) : state.activeTrip ? (
        <section className="nr-driver-card nr-active-trip">
          <div><span className="nr-driver-kicker">ACTIVE TRIP</span><strong>{state.activeTrip.status}</strong></div>
          <div className="nr-trip-route"><span>{state.activeTrip.pickup}</span><Icon name="chevron" /><span>{state.activeTrip.destination}</span></div>
          <button onClick={() => navigate("map")}>Open trip</button>
        </section>
      ) : (
        <section className="nr-driver-card nr-empty-trip">
          <div className="nr-empty-trip-icon"><Icon name="car" size={23} /></div>
          <div>
            <strong>No trips yet</strong>
            <span>{state.online ? "You’re available. New dispatch offers will open automatically when they arrive." : "Go online when eligible to start receiving ride requests."}</span>
          </div>
        </section>
      )}

      <button className="nr-driver-action-row" onClick={onSafety}><Icon name="shield" /><span>Safety & support</span><Icon name="chevron" /></button>
      <DriverBottomNav screen={screen} navigate={navigate} />
    </div>
  );
}

function PageHead({ title, navigate, back = true }: { title: string; navigate: (screen: DriverScreen) => void; back?: boolean }) {
  return <div className="nr-driver-page-head"><div><span className="nr-driver-kicker">NEXRIDE DRIVER</span><h1>{title}</h1></div>{back && <button className="nr-driver-icon-btn" onClick={() => navigate("home")} aria-label="Back to driver home"><Icon name="back" /></button>}</div>;
}

function Metric({ label, value, suffix, hint, loading }: { label: string; value: string; suffix?: string; hint: string; loading: boolean }) {
  return (
    <section className="nr-driver-card nr-metric">
      {loading ? <><span className="nr-driver-skeleton" /><span className="nr-driver-skeleton wide" /></> : <>
        <span>{label}</span>
        <strong>{value} {suffix && <small>{suffix}</small>}</strong>
        <em>{hint}</em>
      </>}
    </section>
  );
}

function DriverBottomNav({ screen, navigate }: { screen: DriverScreen; navigate: (screen: DriverScreen) => void }) {
  const items: { id: DriverScreen; label: string; icon: "home" | "money" | "navigation" | "user" }[] = [
    { id: "home", label: "Home", icon: "home" },
    { id: "earnings", label: "Earnings", icon: "money" },
    { id: "map", label: "Map", icon: "navigation" },
    { id: "profile", label: "Profile", icon: "user" },
  ];

  return <nav className="nr-driver-bottom-nav" aria-label="Driver navigation">{items.map((item) => <button key={item.id} className={screen === item.id ? "active" : ""} onClick={() => navigate(item.id)} aria-current={screen === item.id ? "page" : undefined}><Icon name={item.icon} size={19} /><span>{item.label}</span></button>)}</nav>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import { DriverEarningsScreen } from "./driver-earnings";
import { DriverProfileScreen } from "./driver-profile";
import { supabase } from "../../lib/supabase";
import "../../app/driver/driver-dashboard.css";

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

function verificationCopy(status: ReviewStatus, rejectionReason: string) {
  if (status === "pending") {
    return {
      tone: "pending",
      title: "Verification pending",
      body: "Your driver documents are being reviewed. You can go online after approval.",
      action: "View verification",
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

  useEffect(() => {
    let active = true;
    let driverChannel: ReturnType<typeof supabase.channel> | null = null;
    let offerChannel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!active) return;

      if (sessionError || !data.session) {
        setError("Your driver session could not be restored.");
        setLoading(false);
        return;
      }

      if (data.session.user.user_metadata?.role !== "driver") {
        router.replace("/auth");
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
    };
  }, [router]);

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

    supabase
      .from("drivers")
      .update({ is_online: false })
      .eq("id", driverId)
      .then(({ error: updateError }) => {
        if (updateError) setError("Location access was lost. Go offline and restore location access.");
        else setState((current) => ({ ...current, online: false }));
      });
  }, [driverId, locationPermission, state.online]);

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

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationPermission("unsupported");
      return;
    }

    setError("");
    setLocationPermission("checking");

    navigator.geolocation.getCurrentPosition(
      () => setLocationPermission("granted"),
      (positionError) => {
        if (positionError.code === positionError.PERMISSION_DENIED) {
          setLocationPermission("denied");
          setError("Location permission is blocked. Enable it in your browser or device settings, then try again.");
        } else {
          setLocationPermission("prompt");
          setError("NexRide could not get your location. Check GPS and try again.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    );
  };

  const resolveBlock = () => {
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
    const { data, error: updateError } = await supabase
      .from("drivers")
      .update({ is_online: nextOnline })
      .eq("id", driverId)
      .select("review_status,rejection_reason,is_online,rating")
      .single();

    if (updateError) {
      setError(updateError.message || "Availability could not be updated. Please try again.");
    } else {
      setState((current) => mergeDriverState(current, data as Record<string, unknown>));
    }

    setUpdating(false);
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
      <div className="nr-driver-page">
        <PageHead title="Map" navigate={navigate} back={false} />
        <div className="nr-driver-map-placeholder">
          <Icon name="navigation" size={34} />
          <strong>Driver map</strong>
          <span>Live trip navigation will appear here when dispatch and driver positioning are connected.</span>
        </div>
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
        <div className="nr-driver-avatar">{state.avatarUrl ? <img src={state.avatarUrl} alt="" /> : initials}</div>
        <div>
          <span className="nr-driver-kicker">DRIVER HOME</span>
          <h1>Good day, {firstName}</h1>
          <p>Ready when you are.</p>
        </div>
        <button className="nr-driver-icon-btn" onClick={() => navigate("profile")} aria-label="Open driver profile"><Icon name="user" /></button>
      </header>

      <section className={`nr-driver-card nr-availability-card ${state.online ? "is-online" : ""}`}>
        <div className="nr-availability-copy">
          <span className={`nr-status-dot ${state.online ? "online" : "offline"}`} aria-hidden="true" />
          <div>
            <strong>{state.online ? "Online" : "Offline"}</strong>
            <span>{state.online ? "Available for ride requests." : "Not receiving ride requests."}</span>
          </div>
        </div>
        <button
          className={`nr-driver-primary ${state.online ? "secondary-state" : ""}`}
          disabled={loading || updating || (!state.online && !canGoOnline)}
          onClick={toggleAvailability}
        >
          {updating ? "Updating…" : state.online ? "Go Offline" : "Go Online"}
        </button>
      </section>

      {error && <div className="nr-driver-notice error" role="alert"><Icon name="info" /><div><strong>Driver status unavailable</strong><span>{error}</span></div></div>}

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
            <span>{state.online ? "Trip activity will appear here when dispatch data is connected." : "Go online when eligible to start receiving ride requests."}</span>
          </div>
        </section>
      )}

      <button className="nr-driver-action-row" onClick={onSafety}><Icon name="shield" /><span>Safety & support</span><Icon name="chevron" /></button>
      <DriverBottomNav screen={screen} navigate={navigate} />
    </div>
  );
}

function PageHead({ title, navigate, back = true }: { title: string; navigate: (screen: DriverScreen) => void; back?: boolean }) {
  return <div className="nr-driver-page-head"><div><span className="nr-driver-kicker">NEXRIDE DRIVER</span><h1>{title}</h1></div>{back && <button className="nr-driver-icon-btn" onClick={() => navigate("home")} aria-label="Back to driver home"><Icon name="chevron" /></button>}</div>;
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

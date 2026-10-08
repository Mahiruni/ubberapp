"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, LanguageContext } from "./ui";
import { useDriverTheme } from "./driver-app-shell";
import { RiderMap } from "./rider-map";
import { useRiderLocation } from "../../lib/nexride-location";
import { DriverEarningsScreen } from "./driver-earnings";
import { DriverProfileScreen } from "./driver-profile";
import { DriverAvailabilitySwipe } from "./driver-availability-swipe";
import { supabase } from "../../lib/supabase";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { emitNexRideFeedback } from "../../lib/nexride-feedback";
import "../../app/driver/driver-dashboard.css";
import "../../app/driver/driver-home-v2.css";
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
  activeTrip: { pickup: string; destination: string; status: string } | null;
};

const emptyState: DriverState = {
  name: "Driver",
  avatarUrl: "",
  online: false,
  reviewStatus: "draft",
  rejectionReason: "",
  rating: null,
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
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const { resolvedTheme } = useDriverTheme();
  const [state, setState] = useState<DriverState>(emptyState);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [locationPermission, setLocationPermission] = useState<LocationPermission>("checking");
  const [alertPermission, setAlertPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const sync = () => setAlertPermission(Notification.permission);
    sync();
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  const enableDriverAlerts = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const permission = await Notification.requestPermission();
      setAlertPermission(permission);
    } catch {
      setAlertPermission(Notification.permission);
    }
  };
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
        emitNexRideFeedback({
          event: "ride_request",
          id: pendingOffer.id,
          expiresAt: pendingOffer.expires_at,
          title: "New ride request",
          body: "Open NexRide to review this request.",
          url: `/driver/request?offer=${pendingOffer.id}`,
        });
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
            emitNexRideFeedback({
              event: "ride_request",
              id: next.id,
              expiresAt: typeof next.expires_at === "string" ? next.expires_at : null,
              title: "New ride request",
              body: "Open NexRide to review this request.",
              url: `/driver/request?offer=${next.id}`,
            });
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

  // Persistent app-shell runtime owns live GPS and offer subscriptions.
  // Android may suspend a minimized PWA: never silently log the driver out
  // or flip the server's Online state because visibility or GPS was paused.
  useEffect(() => {
    if (!driverId || !state.online || locationPermission !== "denied") return;
    setError("Location access is unavailable. Keep NexRide open and restore GPS for accurate ride matching.");
  }, [driverId, locationPermission, state.online]);

  const initials = useMemo(
    () => state.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR",
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
    if (!state.online && !verified) return;

    setUpdating(true);
    setError("");

    const nextOnline = !state.online;
    let location: Record<string, unknown> | undefined;

    if (!nextOnline) {
      const activeRide = await supabase
        .from("ride_requests")
        .select("id,status")
        .eq("assigned_driver_id", driverId)
        .in("status", ["accepted", "arrived_pickup", "in_trip"])
        .limit(1)
        .maybeSingle();

      if (activeRide.error) {
        setError("NexRide could not verify your active-trip status. Stay online and try again.");
        setUpdating(false);
        return;
      }

      if (activeRide.data) {
        setError("You’re on an active trip. Complete or cancel it before going offline.");
        setUpdating(false);
        return;
      }
    }

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
        } else if (payload?.status === "vehicle_identity_incomplete") {
          setError("Complete your vehicle model, color, and plate before going online.");
          router.push("/driver/verification");
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
        const confirmed = payload.driver as Record<string, unknown>;
        setState((current) => mergeDriverState(current, confirmed));
        if ((confirmed.is_online === true) === nextOnline) {
          window.dispatchEvent(new Event("nexride:driver-availability-changed"));
          emitNexRideFeedback({ event: nextOnline ? "driver_online" : "driver_offline" });
        }
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
      </div>
    );
  }

  if (screen === "map") {
    return (
      <div className="nr-driver-page nr-driver-map-page">
        <header className="nr-driver-map-header">
          <div>
            <span className="nr-driver-kicker">NEXRIDE · DRIVER</span>
            <h1>Driver map</h1>
            <p>{state.online ? "You’re online and ready for ride requests." : "Go online when you’re ready to receive requests."}</p>
          </div>
          <span className={`nr-driver-header-status ${state.online ? "is-online" : ""}`} role="status">
            <span className="nr-status-dot" aria-hidden="true" />
            {state.online ? "Online" : "Offline"}
          </span>
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
            showProfile={false}
            preferredStyle={resolvedTheme === "dark" ? "dark" : "streets"}
          />

          <div className="nr-driver-map-float">
            <div className="nr-driver-map-state">
              <span className={`nr-status-dot ${state.online ? "online" : "offline"}`} aria-hidden="true" />
              <div>
                <strong>{state.online ? "Online" : "Offline"}</strong>
                <span>
                  {mapLocation.status === "ready"
                    ? "Your current location is centered on the map."
                    : mapLocation.status === "denied"
                      ? "Location permission is blocked on this device."
                      : "Use the location button to center the map on you."}
                </span>
              </div>
            </div>
            <button
              className={`nr-driver-primary ${state.online ? "secondary-state" : ""}`}
              disabled={loading || updating || (!state.online && !canGoOnline)}
              onClick={toggleAvailability}
            >
              {updating ? "Updating…" : state.online ? "Go offline" : "Go online"}
            </button>
          </div>
        </section>

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
      </div>
    );
  }

  const swipeFeedback = !verified
    ? say("Verification required", "ማረጋገጫ ያስፈልጋል")
    : error
      ? error.toLowerCase().includes("active trip")
        ? say("Finish active trip first", "መጀመሪያ ንቁ ጉዞውን ያጠናቅቁ")
        : error.toLowerCase().includes("location") || error.toLowerCase().includes("gps")
          ? say("Location required · swipe to retry", "አካባቢ ያስፈልጋል · ለመድገም ያንሸራትቱ")
          : say("Try again", "እንደገና ይሞክሩ")
      : undefined;

  return (
    <div className="nr-driver-page nr-driver-home-cockpit">
      <section
        className={`nr-driver-home-map-canvas ${state.online ? "is-online" : "is-offline"}`}
        aria-label="Driver operational map"
      >
        <RiderMap
          position={mapLocation.position}
          status={mapLocation.status}
          locate={mapLocation.locate}
          recenter={mapLocation.recenter}
          initials={initials}
          onProfile={() => navigate("profile")}
          locked={loading}
          readOnly
          showProfile={false}
          preferredStyle={resolvedTheme === "dark" ? "dark" : "streets"}
          showSearch={false}
          showNativeControls={false}
        />

        <button
          type="button"
          className="nr-driver-home-profile"
          onClick={() => navigate("profile")}
          aria-label={say("Open Driver profile", "የአሽከርካሪ መለያን ክፈት")}
        >
          {state.avatarUrl ? <img src={state.avatarUrl} alt="" /> : <Icon name="user" size={22} />}
        </button>

        <div
          className="nr-driver-home-swipe"
          data-map-input-boundary="true"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onPointerCancel={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
          onTouchMove={(event) => event.stopPropagation()}
          onTouchEnd={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <div className="nr-driver-home-control-panel">
            <div className="nr-driver-home-control-heading">
              <div className="nr-driver-home-control-state">
                <span className="nr-driver-home-control-brand">NEXRIDE · DRIVER</span>
                <strong>{state.online ? say("Ready for rides", "ለጉዞ ዝግጁ") : say("You're offline", "ከመስመር ውጭ ነዎት")}</strong>
                <small>{state.online
                  ? say("Online stays active when minimized. Android may pause GPS and delay alerts until you reopen NexRide.", "መተግበሪያው ሲቀነስ የመስመር ላይ ሁኔታዎ ይቀጥላል። Android GPSን እና ማሳወቂያዎችን ሊያዘገይ ይችላል።")
                  : say("Swipe to start receiving ride requests", "ጉዞ ለመቀበል ያንሸራትቱ")}</small>
              </div>
              <span className="nr-driver-home-control-online" data-online={state.online ? "true" : "false"}>
                <span aria-hidden="true" />{state.online ? say("Online", "መስመር ላይ") : say("Offline", "ከመስመር ውጭ")}
              </span>
            </div>
            <div className="nr-driver-home-control-meta" aria-label={say("Operational status", "የኦፕሬሽን ሁኔታ")}>
              <span><Icon name="navigation" size={15} />{mapLocation.status === "ready" ? say("GPS ready", "GPS ዝግጁ") : say("GPS needs attention", "GPS ማረጋገጥ ያስፈልጋል")}</span>
              <button
                type="button"
                disabled={alertPermission === "granted" || alertPermission === "unsupported" || alertPermission === "denied"}
                onClick={() => void enableDriverAlerts()}
                aria-label={say("Enable ride notifications", "የጉዞ ማሳወቂያዎችን አንቃ")}
              >
                <Icon name="bell" size={15} />
                {alertPermission === "granted" ? say("Alerts enabled", "ማሳወቂያ በርቷል")
                  : alertPermission === "denied" ? say("Alerts blocked", "ማሳወቂያ ታግዷል")
                  : alertPermission === "unsupported" ? say("In-app alerts", "የውስጥ ማሳወቂያ")
                  : say("Enable alerts", "ማሳወቂያን አንቃ")}
              </button>
            </div>
            <DriverAvailabilitySwipe
              online={state.online}
              updating={updating}
              disabled={loading || (!state.online && !verified)}
              labelOverride={swipeFeedback}
              onToggle={toggleAvailability}
            />
            <nav className="nr-driver-home-quick-actions" aria-label={say("Driver quick actions", "የአሽከርካሪ ፈጣን አማራጮች")}>
              <button type="button" onClick={() => router.push("/driver/activity")}><Icon name="clock" size={16} />{say("Activity", "እንቅስቃሴ")}</button>
              <button type="button" onClick={() => router.push("/driver/earnings")}><Icon name="wallet" size={16} />{say("Earnings", "ገቢ")}</button>
              <button type="button" onClick={() => router.push("/driver/profile/settings")}><Icon name="settings" size={16} />{say("Settings", "ቅንብሮች")}</button>
            </nav>
          </div>
        </div>
      </section>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../components/nexride/ui";
import { DriverBottomNav, usePersistedDriverTheme } from "../../components/nexride/driver-app-shell";
import { RiderMenu, usePersistedRiderTheme } from "../../components/nexride/rider-menu";
import { useOperationalTranslation } from "../../components/nexride/operational-i18n";
import { supabase } from "../../lib/supabase";
import "../nexride.css";
import "./safety.css";
import "../detail-system.css";

type SafetyView = "home" | "sos" | "share" | "help" | "report";
type SafetyRole = "rider" | "driver";

type TripContext = {
  rideRequestId: string | null;
  tripReference: string | null;
  status: string;
  pickup: string;
  destination: string;
  category: string;
  source: "driver_live" | "rider_snapshot" | "none";
};

const emptyTrip: TripContext = {
  rideRequestId: null,
  tripReference: null,
  status: "",
  pickup: "",
  destination: "",
  category: "",
  source: "none",
};

const REPORT_CATEGORIES = [
  ["safety_concern", "Safety concern"],
  ["unsafe_driving", "Unsafe driving"],
  ["vehicle_issue", "Vehicle issue"],
  ["harassment", "Harassment or misconduct"],
  ["payment_issue", "Payment issue"],
  ["lost_item", "Lost item"],
  ["other", "Other"],
] as const;

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRiderSnapshot(): TripContext {
  try {
    const raw = window.sessionStorage.getItem("nexride.safety.trip");
    if (!raw) return emptyTrip;
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      rideRequestId: null,
      tripReference: safeText(data.id) || null,
      status: safeText(data.status),
      pickup: safeText(data.pickup),
      destination: safeText(data.destination),
      category: safeText(data.category),
      source: "rider_snapshot",
    };
  } catch {
    return emptyTrip;
  }
}

export default function SafetyCenterPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const theme = usePersistedRiderTheme();
  const driverTheme = usePersistedDriverTheme();
  const [view, setView] = useState<SafetyView>("home");
  const [role, setRole] = useState<SafetyRole>("rider");
  const [trip, setTrip] = useState<TripContext>(emptyTrip);
  const [userId, setUserId] = useState("");
  const [online, setOnline] = useState(true);
  const [loadingTrip, setLoadingTrip] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get("role") === "driver" ? "driver" : "rider";
    setRole(requestedRole);
    setOnline(navigator.onLine);

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const session = data.session;
      setUserId(session?.user.id || "");

      if (requestedRole === "driver" && session) {
        const requestedRide = params.get("ride");
        let query = supabase
          .from("ride_requests")
          .select("id,status,pickup_location,destination_location,ride_category")
          .eq("assigned_driver_id", session.user.id)
          .in("status", ["accepted", "arrived_pickup", "in_trip"]);

        query = requestedRide
          ? query.eq("id", requestedRide)
          : query.order("accepted_at", { ascending: false }).limit(1);

        const { data: ride } = await query.maybeSingle();
        if (active && ride) {
          setTrip({
            rideRequestId: ride.id,
            tripReference: ride.id,
            status: ride.status || "",
            pickup: ride.pickup_location || "",
            destination: ride.destination_location || "",
            category: ride.ride_category || "",
            source: "driver_live",
          });
        }
      } else {
        const snapshot = readRiderSnapshot();
        const requestedTrip = params.get("trip");
        if (requestedTrip && !snapshot.tripReference) {
          snapshot.tripReference = requestedTrip;
        }
        if (active) setTrip(snapshot);
      }

      if (active) setLoadingTrip(false);
    })().catch(() => {
      if (active) setLoadingTrip(false);
    });

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const back = () => {
    if (view !== "home") {
      setView("home");
      return;
    }
    if (window.history.length > 1) router.back();
    else router.replace(role === "driver" ? "/driver/home" : "/");
  };

  return (
    <main className="nr-app nr-safety-page" data-theme={role === "rider" ? theme : driverTheme.resolvedTheme} data-mode={role}>
      <div className="nr-safety-wrap">
        <header className="nr-safety-head">
          <button className="nr-safety-back" onClick={back} aria-label={view === "home" ? op("Back") : op("Back to Safety Center")}>
            <Icon name="back" />
          </button>
          <div>
            <span>NEXRIDE · SAFETY</span>
            <h1>{view === "home" ? op("Safety Center") : view === "sos" ? op("Emergency SOS") : view === "share" ? op("Share your trip") : view === "help" ? op("Help Center") : op("Report an issue")}</h1>
          </div>
          <span className={`nr-safety-network ${online ? "online" : "offline"}`}>
            <i /> {online ? op("Online") : op("Offline")}
          </span>
        </header>

        {!online && (
          <div className="nr-safety-offline" role="status">
            <Icon name="info" size={17} />
            <span>{op("You’re offline. Emergency phone shortcuts can still work, but reports cannot be sent until you reconnect.")}</span>
          </div>
        )}

        {view === "home" && (
          <SafetyHome role={role} trip={trip} loadingTrip={loadingTrip} open={setView} />
        )}
        {view === "sos" && <EmergencySOS />}
        {view === "share" && <TripShare trip={trip} role={role} online={online} />}
        {view === "help" && <HelpCenter />}
        {view === "report" && (
          <SafetyReport
            trip={trip}
            role={role}
            online={online}
            userId={userId}
          />
        )}
      </div>
      {role === "rider" ? <RiderMenu active="safety" /> : <DriverBottomNav activeOverride="account" />}
    </main>
  );
}

function SafetyHome({
  role,
  trip,
  loadingTrip,
  open,
}: {
  role: SafetyRole;
  trip: TripContext;
  loadingTrip: boolean;
  open: (view: SafetyView) => void;
}) {
  const op = useOperationalTranslation();
  return (
    <>
      <section className="nr-safety-intro">
        <div className="nr-safety-shield"><Icon name="shield" size={26} /></div>
        <div>
          <strong>{op("Help and safety tools when you need them")}</strong>
          <p>{op("Choose the action that matches what you need right now.")}</p>
        </div>
      </section>

      <div className="nr-safety-actions">
        <SafetyAction
          tone="danger"
          icon="phone"
          title={op("Emergency SOS")}
          detail={op("Open emergency call options. NexRide does not dispatch responders.")}
          onClick={() => open("sos")}
        />
        <SafetyAction
          tone="success"
          icon="share"
          title={op("Share your trip")}
          detail={op("Share a one-time trip snapshot with someone you trust.")}
          onClick={() => open("share")}
        />
        <SafetyAction
          tone="info"
          icon="chat"
          title={op("Help Center")}
          detail={op("Find guidance for safety, trip, location, and connection issues.")}
          onClick={() => open("help")}
        />
        <SafetyAction
          tone="neutral"
          icon="info"
          title={op("Report an issue")}
          detail={op("Tell NexRide what happened and include trip details when available.")}
          onClick={() => open("report")}
        />
      </div>

      <section className="nr-safety-context">
        <span>{op("TRIP CONTEXT")}</span>
        {loadingTrip ? (
          <p>{op("Checking your trip…")}</p>
        ) : trip.source !== "none" ? (
          <>
            <strong>{role === "driver" ? op("Driver trip context available") : op("Rider trip context available")}</strong>
            <p>{[trip.pickup, trip.destination].filter(Boolean).join(" → ") || op("Trip reference available.")}</p>
          </>
        ) : (
          <>
            <strong>{op("No active trip")}</strong>
            <p>{op("Safety tools are still available. Trip details are attached only when a current trip is available.")}</p>
          </>
        )}
      </section>
    </>
  );
}

function SafetyAction({
  tone,
  icon,
  title,
  detail,
  onClick,
}: {
  tone: "danger" | "success" | "info" | "neutral";
  icon: "phone" | "share" | "chat" | "info";
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="nr-safety-action" data-tone={tone} onClick={onClick}>
      <span className="nr-safety-action-icon"><Icon name={icon} size={22} /></span>
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <Icon name="chevron" size={17} />
    </button>
  );
}

function EmergencySOS() {
  const op = useOperationalTranslation();
  const HOLD_MS = 1800;
  const [progress, setProgress] = useState(0);
  const [opened, setOpened] = useState(false);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);

  const cancelHold = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (!opened) setProgress(0);
  };

  const activate = () => {
    cancelHold();
    setProgress(100);
    setOpened(true);
  };

  const beginHold = () => {
    if (opened) return;
    cancelHold();
    startRef.current = performance.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      const next = Math.min(100, (elapsed / HOLD_MS) * 100);
      setProgress(next);
      if (next >= 100) activate();
    }, 40);
  };

  useEffect(() => () => cancelHold(), []);

  return (
    <section className="nr-sos-panel">
      <div className="nr-sos-explainer">
        <span className="nr-sos-icon"><Icon name="phone" size={25} /></span>
        <div>
          <strong>{op("Emergency call options")}</strong>
          <p>{op("Holding the control opens emergency phone shortcuts. NexRide does not send an emergency alert or dispatch responders.")}</p>
        </div>
      </div>

      {!opened ? (
        <>
          <button
            className="nr-sos-hold"
            onPointerDown={beginHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            aria-describedby="nr-sos-hold-note"
          >
            <span className="nr-sos-progress" style={{ width: `${progress}%` }} aria-hidden="true" />
            <span>{op("Hold for emergency options")}</span>
          </button>
          <div className="nr-sos-progress-label" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            {progress > 0 ? `${Math.round(progress)}% · release to cancel` : op("Hold for about 2 seconds")}
          </div>
          <p id="nr-sos-hold-note" className="nr-sos-accessible-note">You can release at any time before activation. For keyboard, switch-control, or other assistive access, use the button below.</p>
          <button className="nr-sos-alternative" onClick={activate}>{op("Open emergency call options")}</button>
        </>
      ) : (
        <div className="nr-sos-options" role="status">
          <div className="nr-sos-not-sent">
            <Icon name="info" size={18} />
            <span><strong>{op("No emergency alert has been sent.")}</strong> {op("Choose a phone service below to place the call yourself.")}</span>
          </div>
          <a href="tel:991"><span>Addis Ababa Police</span><strong>991</strong></a>
          <a href="tel:912"><span>Fire service</span><strong>912</strong></a>
          <a href="tel:907"><span>Red Cross</span><strong>907</strong></a>
          <button onClick={() => { setOpened(false); setProgress(0); }}>{op("Close emergency options")}</button>
        </div>
      )}

      <div className="nr-sos-footnote">
        These shortcuts open your device phone app. Calling availability depends on your carrier/device. If you are outside Addis Ababa, use the appropriate local emergency number for your location.
      </div>
    </section>
  );
}

function TripShare({
  trip,
  role,
  online,
}: {
  trip: TripContext;
  role: SafetyRole;
  online: boolean;
}) {
  const op = useOperationalTranslation();
  const [status, setStatus] = useState("");

  const shareText = useMemo(() => {
    const lines = [
      "NexRide trip snapshot",
      `Role: ${role === "driver" ? "Driver" : "Rider"}`,
      trip.status ? `Trip status: ${trip.status}` : "",
      trip.category ? `Ride category: ${trip.category}` : "",
      trip.pickup ? `Pickup: ${trip.pickup}` : "",
      trip.destination ? `Destination: ${trip.destination}` : "",
      trip.tripReference ? `Trip reference: ${trip.tripReference}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }, [role, trip]);

  const share = async () => {
    setStatus("");
    try {
      if (navigator.share) {
        await navigator.share({ title: "NexRide trip", text: shareText });
        setStatus(op("Trip snapshot shared using your device share sheet."));
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setStatus(op("Trip snapshot copied. Paste it into the app you want to use."));
      } else {
        setStatus(op("Sharing is not supported by this browser. You can manually copy the trip details shown below."));
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus(op("Sharing cancelled. Nothing was sent by NexRide."));
      } else {
        setStatus(op("The device share action could not be completed."));
      }
    }
  };

  return (
    <section className="nr-share-panel">
      <div className="nr-share-note">
        <Icon name="share" size={20} />
        <div>
          <strong>Review before sharing</strong>
          <p>NexRide currently supports a one-time text snapshot, not continuous live-location sharing. Because this is not a live share, there is no ongoing share session to stop.</p>
        </div>
      </div>

      <div className="nr-share-preview">
        <span>INFORMATION TO SHARE</span>
        {trip.source === "none" ? (
          <p>No active trip details are available. The shared text will identify only your NexRide role.</p>
        ) : (
          <>
            {trip.status && <ShareRow label={op("Status")} value={trip.status} />}
            {trip.category && <ShareRow label={op("Ride")} value={trip.category} />}
            {trip.pickup && <ShareRow label={op("Pickup")} value={trip.pickup} />}
            {trip.destination && <ShareRow label={op("Destination")} value={trip.destination} />}
            {trip.tripReference && <ShareRow label={op("Trip reference")} value={trip.tripReference} />}
          </>
        )}
      </div>

      {!online && <p className="nr-share-offline">You are offline. Device sharing or copying may still work, but no live NexRide data can refresh until you reconnect.</p>}
      <button className="nr-share-primary" onClick={share}><Icon name="share" size={18} /> {op("Share trip")}</button>
      {status && <p className="nr-share-status" role="status">{status}</p>}
    </section>
  );
}

function ShareRow({ label, value }: { label: string; value: string }) {
  return <div className="nr-share-row"><span>{label}</span><strong>{value}</strong></div>;
}

function HelpCenter() {
  const op = useOperationalTranslation();
  return (
    <section className="nr-help-panel">
      <div className="nr-help-intro">
        <span><Icon name="chat" size={22} /></span>
        <div>
          <strong>{op("Safety guidance")}</strong>
          <p>These help topics are available in-app. Live NexRide support chat is not currently connected, so the app will not pretend an agent is responding.</p>
        </div>
      </div>
      <details open>
        <summary>Emergency or immediate danger</summary>
        <p>Use Emergency SOS to open phone shortcuts. NexRide currently does not dispatch responders or notify a trusted contact automatically.</p>
      </details>
      <details>
        <summary>Something happened during a trip</summary>
        <p>Use Report an issue. NexRide can attach the active trip reference when it is available and save your report securely for follow-up.</p>
      </details>
      <details>
        <summary>Trip sharing</summary>
        <p>The current implementation shares a one-time trip snapshot through your device. It does not expose a continuously updating live-tracking link.</p>
      </details>
      <details>
        <summary>GPS or internet is unavailable</summary>
        <p>Emergency phone calling can work independently of NexRide data. Reporting requires an internet connection. Keep the report details in the form and submit after reconnecting.</p>
      </details>
    </section>
  );
}

function SafetyReport({
  trip,
  role,
  online,
  userId,
}: {
  trip: TripContext;
  role: SafetyRole;
  online: boolean;
  userId: string;
}) {
  const op = useOperationalTranslation();
  const [category, setCategory] = useState<(typeof REPORT_CATEGORIES)[number][0]>("safety_concern");
  const [details, setDetails] = useState("");
  const [includeTrip, setIncludeTrip] = useState(trip.source !== "none");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    try {
      const draft = window.localStorage.getItem("nexride.safety.report.draft");
      if (!draft) return;
      const parsed = JSON.parse(draft);
      if (typeof parsed.details === "string") setDetails(parsed.details.slice(0, 4000));
      if (REPORT_CATEGORIES.some(([id]) => id === parsed.category)) setCategory(parsed.category);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("nexride.safety.report.draft", JSON.stringify({ category, details }));
    } catch {}
  }, [category, details]);

  const submit = async () => {
    setFeedback("");
    setSuccess(false);

    if (!userId) {
      setFeedback(op("Sign in to NexRide before submitting a report. Emergency phone options remain available without sign-in."));
      return;
    }
    if (!online) {
      setFeedback("You are offline. Your report draft is saved on this device; submit it after you reconnect.");
      return;
    }

    setSubmitting(true);
    const context = includeTrip ? {
      role,
      trip_status: trip.status || null,
      pickup: trip.pickup || null,
      destination: trip.destination || null,
      ride_category: trip.category || null,
      source: trip.source,
    } : { role, source: "none" };

    const { data, error } = await supabase
      .from("safety_reports")
      .insert({
        ride_request_id: includeTrip ? trip.rideRequestId : null,
        trip_reference: includeTrip ? trip.tripReference : null,
        category,
        details: details.trim() || null,
        context,
      })
      .select("id,status,created_at")
      .single();

    if (error || !data) {
      setFeedback(op("NexRide could not submit this report. Your draft is still saved on this device."));
    } else {
      setSuccess(true);
      setFeedback(`Report submitted. Reference ${String(data.id).slice(0, 8).toUpperCase()}. No emergency responder has been dispatched by this report.`);
      setDetails("");
      try { window.localStorage.removeItem("nexride.safety.report.draft"); } catch {}
    }
    setSubmitting(false);
  };

  return (
    <section className="nr-report-panel">
      <div className="nr-report-context">
        <span><Icon name="shield" size={19} /></span>
        <div>
          <strong>{includeTrip && trip.source !== "none" ? op("Trip context will be included") : op("General safety report")}</strong>
          <p>{includeTrip && trip.source !== "none" ? [trip.pickup, trip.destination].filter(Boolean).join(" → ") || op("Current trip reference") : op("No trip-specific information will be attached.")}</p>
        </div>
      </div>

      <label className="nr-safety-field">
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
          {REPORT_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{op(label)}</option>)}
        </select>
      </label>

      <label className="nr-safety-field">
        Details <span>Optional</span>
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value.slice(0, 4000))}
          placeholder={op("Describe what happened or what you need help with.")}
          rows={7}
        />
        <small>{details.length}/4000</small>
      </label>

      {trip.source !== "none" && (
        <label className="nr-safety-check">
          <input type="checkbox" checked={includeTrip} onChange={(event) => setIncludeTrip(event.target.checked)} />
          <span><strong>Include current trip context</strong><small>Trip reference, status, pickup, destination, and ride category when available.</small></span>
        </label>
      )}

      <button className="nr-report-submit" disabled={submitting || !online} onClick={submit}>
        {submitting ? op("Submitting…") : online ? op("Submit report") : op("Reconnect to submit")}
      </button>

      {feedback && <div className={`nr-report-feedback ${success ? "success" : ""}`} role={success ? "status" : "alert"}><Icon name={success ? "check" : "info"} size={17} /><span>{feedback}</span></div>}

      <p className="nr-report-disclaimer">Submitting a report sends information to NexRide for review. It is not an emergency dispatch request. For immediate danger, use Emergency SOS and call the appropriate emergency service.</p>
    </section>
  );
}

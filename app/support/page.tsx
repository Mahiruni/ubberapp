"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../components/nexride/ui";
import { DriverStandaloneMenu, usePersistedDriverTheme } from "../../components/nexride/driver-app-shell";
import { RiderMenu, usePersistedRiderTheme } from "../../components/nexride/rider-menu";
import { useOperationalTranslation } from "../../components/nexride/operational-i18n";
import { supabase } from "../../lib/supabase";
import "../nexride.css";
import "../rider/supporting.css";
import "../detail-system.css";

const DRAFT_KEY = "nexride.support.draft";

const TOPICS = [
  {
    title: "A ride did not go as expected",
    body: "Open Activity, choose the trip, and select Get help with this trip so the correct ride is attached.",
    tags: "trip driver route cancellation receipt",
  },
  {
    title: "Payment shows pending or failed",
    body: "Open Payments to review the trip’s payment status. Cash is available, and online payment appears only when it is enabled.",
    tags: "payment cash wallet pending failed",
  },
  {
    title: "Contact your driver",
    body: "Call or message your driver from an active assigned trip when contact options are available.",
    tags: "chat call driver message contact",
  },
  {
    title: "Emergency or safety concern",
    body: "Open Safety for emergency call options, trip sharing, and safety reporting. NexRide does not dispatch emergency responders.",
    tags: "safety emergency sos share",
  },
  {
    title: "Lost item after a ride",
    body: "Choose Lost item, select the relevant trip, and tell us what was lost. Avoid including unnecessary sensitive information.",
    tags: "lost item belongings trip",
  },
  {
    title: "App or connection problem",
    body: "Your draft stays on this device if you go offline. Reconnect and send it when you’re ready.",
    tags: "app connection offline error report",
  },
] as const;

type RideOption = {
  id: string;
  pickup_location: string;
  destination_location: string;
  status: string;
  created_at: string;
};

type Category = "trip_issue" | "payment" | "driver" | "app" | "lost_item" | "other";

export default function HelpSupportPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const theme = usePersistedRiderTheme();
  const driverTheme = usePersistedDriverTheme();
  const [role, setRole] = useState<"rider" | "driver">("rider");
  const [userId, setUserId] = useState("");
  const [rides, setRides] = useState<RideOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRide, setSelectedRide] = useState("");
  const [category, setCategory] = useState<Category>("trip_issue");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const params = new URLSearchParams(window.location.search);
    const requestedRole = params.get("role") === "driver" ? "driver" : "rider";
    setRole(requestedRole);
    const requestedRide = params.get("ride") || "";

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (typeof draft.details === "string") setDetails(draft.details.slice(0, 4000));
        if (["trip_issue","payment","driver","app","lost_item","other"].includes(draft.category)) setCategory(draft.category);
        if (typeof draft.ride === "string") setSelectedRide(draft.ride);
      }
    } catch {}

    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace(requestedRole === "driver" ? "/driver/auth" : "/rider/sign-in");
        return;
      }

      setUserId(session.user.id);

      let ridesQuery = supabase
        .from("ride_requests")
        .select("id,pickup_location,destination_location,status,created_at");
      ridesQuery = requestedRole === "driver"
        ? ridesQuery.eq("assigned_driver_id", session.user.id)
        : ridesQuery.eq("rider_id", session.user.id);
      const { data: rows } = await ridesQuery
        .order("created_at", { ascending: false })
        .limit(30);

      if (!active) return;
      const next = (rows || []) as RideOption[];
      setRides(next);
      if (requestedRide && next.some((ride) => ride.id === requestedRide)) setSelectedRide(requestedRide);
      setLoading(false);
    })().catch(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ride: selectedRide, category, details }));
    } catch {}
  }, [userId, selectedRide, category, details]);

  const topics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return TOPICS;
    return TOPICS.filter((topic) =>
      (op(topic.title) + " " + op(topic.body) + " " + topic.tags)
        .toLowerCase()
        .includes(query),
    );
  }, [search, op]);

  const activeRide = rides.find((ride) =>
    ["accepted", "arrived_pickup", "in_trip"].includes(ride.status),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || submitting) return;

    const clean = details.trim();
    if (!clean) {
      setSuccess(false);
      setFeedback(op("Describe the issue before submitting."));
      return;
    }

    if (!online) {
      setSuccess(false);
      setFeedback(op("You are offline. Your unfinished report remains saved on this device."));
      return;
    }

    setSubmitting(true);
    setFeedback("");
    setSuccess(false);

    const { data, error } = await supabase
      .from("support_requests")
      .insert({
        ride_request_id: selectedRide || null,
        category,
        details: clean,
      })
      .select("id,status")
      .single();

    if (error || !data) {
      setFeedback(op("Support request could not be submitted. Your draft remains saved on this device."));
    } else {
      setSuccess(true);
      setFeedback(op("Your request was sent. Reference") + " " + String(data.id).slice(0, 8).toUpperCase() + ".");
      setDetails("");
      setSelectedRide("");
      setCategory("trip_issue");
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }

    setSubmitting(false);
  }

  return (
    <main className="nr-app nr-support-page" data-theme={role === "rider" ? theme : driverTheme.resolvedTheme} data-mode={role}>
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => window.history.length > 1 ? router.back() : router.replace("/")} aria-label={op("Back")}>
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE · SUPPORT</span>
            <h1>{op("How can we help?")}</h1>
            <p>{online ? op("Find an answer or tell us what happened.") : op("You’re offline. Your draft is saved on this device.")}</p>
          </div>
          <span />
        </header>

        <div className="nr-help-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={search}
            placeholder={op("Search help")}
            aria-label={op("Search help")}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <section aria-label={op("Help topics")}>
          {topics.length ? topics.map((topic, index) => (
            <details className="nr-help-topic" key={topic.title} open={index === 0 && !search}>
              <summary>{op(topic.title)}</summary>
              <p>{op(topic.body)}</p>
            </details>
          )) : (
            <div className="nr-help-empty">{op("No matching help topics. You can still send us a request below.")}</div>
          )}
        </section>

        <section className="nr-support-card nr-support-channels">
          <a className="nr-support-channel" href={role === "driver" ? "/safety?role=driver" : "/safety?role=rider"}>
            <span><Icon name="shield" size={17} /></span>
            <span><strong>{op("Safety")}</strong><small>{op("Emergency help, trip sharing, and reports")}</small></span>
            <Icon name="chevron" size={15} />
          </a>
          <a className="nr-support-channel" href={role === "driver" ? "/driver/activity" : "/rider/trips"}>
            <span><Icon name="clock" size={17} /></span>
            <span><strong>{op("Activity")}</strong><small>{op("Trips, receipts, and trip-specific support")}</small></span>
            <Icon name="chevron" size={15} />
          </a>
          {activeRide && (
            <a className="nr-support-channel" href={"/trip/chat?ride=" + encodeURIComponent(activeRide.id) + "&role=" + role}>
              <span><Icon name="chat" size={17} /></span>
              <span><strong>{role === "driver" ? op("Message rider") : op("Message driver")}</strong><small>{op("Available during your active trip")}</small></span>
              <Icon name="chevron" size={15} />
            </a>
          )}
        </section>

        <form className="nr-support-card nr-support-form" onSubmit={submit}>
          <div className="nr-profile-panel-head">
            <div>
              <h2>{op("Tell us what happened")}</h2>
              <p>{op("Choose a trip when relevant and send a support request.")}</p>
            </div>
          </div>

          <label>
            {op("Trip")} <small>{op("Optional")}</small>
            <select value={selectedRide} disabled={loading} onChange={(event) => setSelectedRide(event.target.value)}>
              <option value="">No specific trip</option>
              {rides.map((ride) => (
                <option key={ride.id} value={ride.id}>
                  {new Date(ride.created_at).toLocaleDateString("en-ET")} · {ride.pickup_location} → {ride.destination_location}
                </option>
              ))}
            </select>
          </label>

          <label>
            {op("Category")}
            <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
              <option value="trip_issue">Trip issue</option>
              <option value="payment">Payment</option>
              <option value="driver">Driver</option>
              <option value="app">App or connection</option>
              <option value="lost_item">Lost item</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label>
            {op("What happened?")}
            <textarea
              value={details}
              maxLength={4000}
              placeholder={op("Tell us what happened")}
              onChange={(event) => setDetails(event.target.value)}
              required
            />
            <small>{details.length}/4000 · {op("draft saved on this device")}</small>
          </label>

          <button className="nr-support-submit" type="submit" disabled={submitting || !online || !details.trim()}>
            {submitting ? op("Sending…") : online ? op("Send request") : op("Reconnect to send")}
          </button>

          {feedback && (
            <div className={"nr-support-feedback" + (success ? " success" : "")} role={success ? "status" : "alert"}>
              <Icon name={success ? "check" : "info"} size={16} />
              <span>{feedback}</span>
            </div>
          )}
        </form>
      </div>
      {role === "rider" ? <RiderMenu active="messages" /> : <DriverStandaloneMenu activeOverride="messages" />}
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../components/nexride/ui";
import { useOperationalTranslation } from "../../components/nexride/operational-i18n";
import { supabase } from "../../lib/supabase";
import "../nexride.css";
import "../rider/supporting.css";

const DRAFT_KEY = "nexride.support.draft";

const TOPICS = [
  {
    title: "A ride did not go as expected",
    body: "Open the trip from Trip history, review the receipt and status, then use Get help with this trip so NexRide can attach the correct ride reference.",
    tags: "trip driver route cancellation receipt",
  },
  {
    title: "Payment shows pending or failed",
    body: "Wallet & payments shows payment statuses supplied by the trip record. Cash is the only supported rider payment method right now; no raw card data is collected.",
    tags: "payment cash wallet pending failed",
  },
  {
    title: "Contact your driver",
    body: "Rider–driver chat and the call shortcut are available only for an assigned active trip when NexRide has the participant contact information.",
    tags: "chat call driver message contact",
  },
  {
    title: "Emergency or safety concern",
    body: "Use Safety Center for emergency phone shortcuts, trip sharing and safety reporting. NexRide does not claim that opening Safety Center dispatches responders.",
    tags: "safety emergency sos share",
  },
  {
    title: "Lost item after a ride",
    body: "Choose Lost item in the support report and select the relevant past trip. Include a concise description without unnecessary sensitive information.",
    tags: "lost item belongings trip",
  },
  {
    title: "App or connection problem",
    body: "If submission fails, NexRide keeps your unfinished support report draft on this device. Reconnect and submit again.",
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
        router.replace("/rider/sign-in");
        return;
      }

      setUserId(session.user.id);

      const { data: rows } = await supabase
        .from("ride_requests")
        .select("id,pickup_location,destination_location,status,created_at")
        .eq("rider_id", session.user.id)
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
      setFeedback("Support request submitted. Reference " + String(data.id).slice(0, 8).toUpperCase() + ".");
      setDetails("");
      setSelectedRide("");
      setCategory("trip_issue");
      try { localStorage.removeItem(DRAFT_KEY); } catch {}
    }

    setSubmitting(false);
  }

  return (
    <main className="nr-app nr-support-page" data-theme="dark">
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => window.history.length > 1 ? router.back() : router.replace("/")} aria-label={op("Back")}>
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE SUPPORT</span>
            <h1>{op("Help & Support")}</h1>
            <p>{online ? op("Support tools available") : op("Offline · report draft preserved")}</p>
          </div>
          <span />
        </header>

        <div className="nr-help-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={search}
            placeholder={op("Search help topics")}
            aria-label={op("Search help topics")}
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
            <div className="nr-help-empty">No help topic matches “{search}”. You can still submit a support request below.</div>
          )}
        </section>

        <section className="nr-support-card nr-support-channels">
          <a className="nr-support-channel" href="/safety?role=rider">
            <span><Icon name="shield" size={17} /></span>
            <span><strong>{op("Safety Center")}</strong><small>Emergency calling, sharing and safety reporting</small></span>
            <Icon name="chevron" size={15} />
          </a>
          <a className="nr-support-channel" href="/rider/trips">
            <span><Icon name="clock" size={17} /></span>
            <span><strong>{op("Trip history")}</strong><small>Open receipts and trip-specific support</small></span>
            <Icon name="chevron" size={15} />
          </a>
          {activeRide && (
            <a className="nr-support-channel" href={"/trip/chat?ride=" + encodeURIComponent(activeRide.id) + "&role=rider"}>
              <span><Icon name="chat" size={17} /></span>
              <span><strong>{op("Message your driver")}</strong><small>Available for the active assigned trip</small></span>
              <Icon name="chevron" size={15} />
            </a>
          )}
        </section>

        <form className="nr-support-card nr-support-form" onSubmit={submit}>
          <div className="nr-profile-panel-head">
            <div>
              <h2>{op("Contact NexRide support")}</h2>
              <p>Submit an in-app support request. Live agent chat, SMS and phone support are not currently connected.</p>
            </div>
          </div>

          <label>
            Related trip <small>Optional</small>
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
            Issue category
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
            Details
            <textarea
              value={details}
              maxLength={4000}
              placeholder={op("Tell us what happened and what outcome you need.")}
              onChange={(event) => setDetails(event.target.value)}
              required
            />
            <small>{details.length}/4000 · unfinished text is saved on this device</small>
          </label>

          <button className="nr-support-submit" type="submit" disabled={submitting || !online || !details.trim()}>
            {submitting ? op("Submitting…") : online ? op("Submit support request") : op("Reconnect to submit")}
          </button>

          {feedback && (
            <div className={"nr-support-feedback" + (success ? " success" : "")} role={success ? "status" : "alert"}>
              <Icon name={success ? "check" : "info"} size={16} />
              <span>{feedback}</span>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}

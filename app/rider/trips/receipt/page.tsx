"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { RiderBottomNavigation, usePersistedRiderTheme } from "../../../../components/nexride/rider-bottom-nav";
import { supabase } from "../../../../lib/supabase";
import {
  formatRideStatus,
  loadRideRating,
  loadRiderRide,
  rideAmount,
  rideDate,
  type RideRating,
  type RiderRide,
} from "../../../../lib/nexride-rider-support";
import "../../../nexride.css";
import "../../supporting.css";

export default function RiderReceiptPage() {
  const router = useRouter();
  const theme = usePersistedRiderTheme();
  const [ride, setRide] = useState<RiderRide | null>(null);
  const [rating, setRating] = useState<RideRating | null>(null);
  const [userId, setUserId] = useState("");
  const [draftScore, setDraftScore] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ratingError, setRatingError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const rideId = new URLSearchParams(window.location.search).get("ride") || "";
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace("/rider/sign-in");
        return;
      }

      if (!rideId) {
        setError("No ride was selected.");
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      try {
        const [nextRide, nextRating] = await Promise.all([
          loadRiderRide(rideId, session.user.id),
          loadRideRating(rideId, session.user.id),
        ]);
        if (!nextRide) throw new Error("This receipt is not available for your account.");
        if (!active) return;
        setRide(nextRide);
        setRating(nextRating);
        if (nextRating) {
          setDraftScore(nextRating.score);
          setFeedback(nextRating.feedback);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Receipt unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  async function submitRating() {
    if (!ride || !userId || busy || draftScore < 1 || draftScore > 5 || rating) return;
    setBusy(true);
    setRatingError("");

    const { data, error: insertError } = await supabase
      .from("ride_ratings")
      .insert({
        ride_request_id: ride.id,
        score: draftScore,
        feedback: feedback.trim() || null,
      })
      .select("score,feedback")
      .single();

    if (insertError || !data) {
      setRatingError("Your rating could not be confirmed. Please retry.");
    } else {
      setRating({ score: data.score, feedback: data.feedback || "" });
    }
    setBusy(false);
  }

  const amount = ride ? rideAmount(ride) : null;

  return (
    <main className="nr-app nr-support-page" data-theme={theme} data-mode="rider">
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => router.replace("/rider/trips")} aria-label="Back to trip history">
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE RECEIPT</span>
            <h1>Trip details</h1>
            <p>{ride ? new Date(rideDate(ride)).toLocaleString("en-ET", { dateStyle: "medium", timeStyle: "short" }) : "Receipt"}</p>
          </div>
          <span />
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : error || !ride ? (
          <section className="nr-support-state" role="alert">
            <span><Icon name="info" size={22} /></span>
            <strong>Receipt unavailable</strong>
            <p>{error || "This trip receipt could not be loaded."}</p>
            <button onClick={() => router.replace("/rider/trips")}>Back to history</button>
          </section>
        ) : (
          <>
            <section className="nr-support-card nr-receipt-hero">
              <div className="nr-receipt-hero-top">
                <div>
                  <span className="kicker">{ride.category.toUpperCase()}</span>
                  <h2>{amount?.amount === null ? "Amount unavailable" : amount?.amount?.toLocaleString("en-ET") + " ETB"}</h2>
                </div>
                <span className={"nr-receipt-status " + (ride.status === "completed" ? "completed" : ride.status === "cancelled" || ride.status === "withdrawn" ? "cancelled" : "")}>
                  {formatRideStatus(ride.status)}
                </span>
              </div>

              <div className="nr-receipt-route">
                <div className="nr-receipt-stop"><i /><div><span>Pickup</span><strong>{ride.pickup}</strong></div></div>
                <div className="nr-receipt-stop"><i /><div><span>Destination</span><strong>{ride.destination}</strong></div></div>
              </div>
            </section>

            <section className="nr-receipt-grid" aria-label="Receipt summary">
              <ReceiptValue label="Fare" value={amount?.amount === null ? "Unavailable" : amount?.amount?.toLocaleString("en-ET") + " ETB"} note={amount?.final ? "Final fare" : "Estimated fare"} />
              <ReceiptValue label="Payment method" value="Cash" note="Only supported rider method" />
              <ReceiptValue label="Payment status" value={ride.paymentStatus} note={ride.paymentStatus === "paid" ? "Confirmed" : "Backend status"} />
              <ReceiptValue label="Rating" value={rating ? rating.score + " / 5" : "Not rated"} note="Your rider rating" />
            </section>

            {ride.status === "completed" && (
              <section className="nr-support-card nr-rating-panel">
                <h2>{rating ? "Your rating" : "Rate this ride"}</h2>
                <div className="nr-rating-stars" role="group" aria-label="Ride rating">
                  {[1,2,3,4,5].map((score) => (
                    <button
                      key={score}
                      className={score <= (rating?.score || draftScore) ? "active" : ""}
                      onClick={() => !rating && setDraftScore(score)}
                      disabled={Boolean(rating)}
                      aria-label={score + " stars"}
                    >
                      <Icon name="star" size={19} />
                    </button>
                  ))}
                </div>
                {!rating && (
                  <>
                    <textarea
                      value={feedback}
                      maxLength={1000}
                      placeholder="Optional feedback"
                      onChange={(event) => setFeedback(event.target.value)}
                    />
                    <button className="nr-rating-submit" disabled={busy || draftScore === 0} onClick={() => void submitRating()}>
                      {busy ? "Submitting…" : "Submit rating"}
                    </button>
                  </>
                )}
                {rating?.feedback && <p>{rating.feedback}</p>}
                {ratingError && <div className="nr-support-feedback" role="alert"><Icon name="info" size={16} /><span>{ratingError}</span></div>}
              </section>
            )}

            <section className="nr-support-card nr-support-channels">
              <a className="nr-support-channel" href={"/support?ride=" + encodeURIComponent(ride.id)}>
                <span><Icon name="chat" size={17} /></span>
                <span><strong>Get help with this trip</strong><small>Open trip-specific support</small></span>
                <Icon name="chevron" size={15} />
              </a>
              {(ride.status === "accepted" || ride.status === "arrived_pickup" || ride.status === "in_trip") && (
                <a className="nr-support-channel" href={"/trip/chat?ride=" + encodeURIComponent(ride.id) + "&role=rider"}>
                  <span><Icon name="chat" size={17} /></span>
                  <span><strong>Message driver</strong><small>Active-trip conversation</small></span>
                  <Icon name="chevron" size={15} />
                </a>
              )}
            </section>
          </>
        )}
      </div>
      <RiderBottomNavigation active="trips" />
    </main>
  );
}

function ReceiptValue({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="nr-receipt-value">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { useOperationalTranslation } from "../../../../components/nexride/operational-i18n";
import { RiderMenu, usePersistedRiderTheme } from "../../../../components/nexride/rider-menu";
import { supabase } from "../../../../lib/supabase";
import { emitNexRideFeedback } from "../../../../lib/nexride-feedback";
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
import "../../../detail-system.css";

export default function RiderReceiptPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
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
      const params = new URLSearchParams(window.location.search);
      const rideId = params.get("ride") || "";
      const paymentReturn = params.get("payment") || "";
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace("/rider/sign-in");
        return;
      }

      if (!rideId) {
        setError(op("No ride was selected."));
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      try {
        const [nextRide, nextRating] = await Promise.all([
          loadRiderRide(rideId, session.user.id),
          loadRideRating(rideId, session.user.id),
        ]);
        if (!nextRide) throw new Error(op("This receipt is not available for your account."));
        if (!active) return;
        setRide(nextRide);
        setRating(nextRating);
        if (paymentReturn === "paid" && nextRide.paymentStatus === "paid") {
          emitNexRideFeedback({
            event: "payment_success",
            id: nextRide.id,
            title: "Payment confirmed",
            body: "Your NexRide payment was successfully verified.",
            url: `/rider/trips/receipt?ride=${encodeURIComponent(nextRide.id)}`,
          });
        }
        if (nextRating) {
          setDraftScore(nextRating.score);
          setFeedback(nextRating.feedback);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : op("Receipt unavailable."));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router, op]);

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
      setRatingError(op("Your rating could not be confirmed. Try again."));
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
            <span className="kicker">NEXRIDE · TRIP</span>
            <h1>{op("Trip details")}</h1>
            <p>{ride ? new Date(rideDate(ride)).toLocaleString("en-ET", { dateStyle: "medium", timeStyle: "short" }) : "Receipt"}</p>
          </div>
          <span />
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : error || !ride ? (
          <section className="nr-support-state" role="alert">
            <span><Icon name="info" size={22} /></span>
            <strong>{op("Receipt unavailable")}</strong>
            <p>{error || op("This trip receipt could not be loaded.")}</p>
            <button onClick={() => router.replace("/rider/trips")}>{op("Back to Activity")}</button>
          </section>
        ) : (
          <>
            <section className="nr-support-card nr-receipt-hero">
              <div className="nr-receipt-hero-top">
                <div>
                  <span className="kicker">{ride.category.toUpperCase()}</span>
                  <h2>{amount?.amount === null ? op("Fare unavailable") : amount?.amount?.toLocaleString("en-ET") + " ETB"}</h2>
                </div>
                <span className={"nr-receipt-status " + (ride.status === "completed" ? "completed" : ride.status === "cancelled" || ride.status === "withdrawn" ? "cancelled" : "")}>
                  {op(formatRideStatus(ride.status))}
                </span>
              </div>

              <div className="nr-receipt-route">
                <div className="nr-receipt-stop"><i /><div><span>Pickup</span><strong>{ride.pickup}</strong></div></div>
                <div className="nr-receipt-stop"><i /><div><span>Destination</span><strong>{ride.destination}</strong></div></div>
              </div>
            </section>

            <section className="nr-receipt-grid" aria-label="Receipt summary">
              <ReceiptValue label={op("Fare")} value={amount?.amount === null ? op("Unavailable") : amount?.amount?.toLocaleString("en-ET") + " ETB"} note={amount?.final ? op("Final fare") : op("Estimated fare")} />
              <ReceiptValue label={op("Payment method")} value={op("Cash")} note={op("Pay after your trip")} />
              <ReceiptValue label={op("Payment status")} value={op(ride.paymentStatus)} note={ride.paymentStatus === "paid" ? op("Confirmed") : op("Current status")} />
              <ReceiptValue label={op("Rating")} value={rating ? rating.score + " / 5" : op("Not rated")} note={op("Your feedback")} />
            </section>

            {ride.status === "completed" && (
              <section className="nr-support-card nr-rating-panel">
                <h2>{rating ? op("Your rating") : op("How was your ride?")}</h2>
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
                      placeholder={op("Share optional feedback")}
                      onChange={(event) => setFeedback(event.target.value)}
                    />
                    <button className="nr-rating-submit" disabled={busy || draftScore === 0} onClick={() => void submitRating()}>
                      {busy ? op("Submitting…") : op("Submit rating")}
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
                <span><strong>{op("Get help with this trip")}</strong><small>{op("Support for this ride")}</small></span>
                <Icon name="chevron" size={15} />
              </a>
              {(ride.status === "accepted" || ride.status === "arrived_pickup" || ride.status === "in_trip") && (
                <a className="nr-support-channel" href={"/trip/chat?ride=" + encodeURIComponent(ride.id) + "&role=rider"}>
                  <span><Icon name="chat" size={17} /></span>
                  <span><strong>{op("Message driver")}</strong><small>{op("Trip conversation")}</small></span>
                  <Icon name="chevron" size={15} />
                </a>
              )}
            </section>
          </>
        )}
      </div>
      <RiderMenu active="trips" />
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

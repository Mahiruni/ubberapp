"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../components/nexride/ui";
import { useOperationalTranslation } from "../../../components/nexride/operational-i18n";
import { RiderMenu, usePersistedRiderTheme } from "../../../components/nexride/rider-menu";
import { supabase } from "../../../lib/supabase";
import {
  formatRideStatus,
  loadRiderRideHistory,
  rideAmount,
  rideDate,
  type RiderRide,
} from "../../../lib/nexride-rider-support";
import "../../nexride.css";
import "../supporting.css";
import "../../detail-system.css";

export default function RiderTripsPage() {
  const router = useRouter();
  const op = useOperationalTranslation();
  const theme = usePersistedRiderTheme();
  const [rides, setRides] = useState<RiderRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(userId: string) {
    setLoading(true);
    setError("");
    try {
      const next = await loadRiderRideHistory(userId);
      setRides(next);
    } catch {
      setError(op("We couldn’t load your rides. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (!data.session) {
        router.replace("/rider/sign-in");
        return;
      }
      await load(data.session.user.id);
    })();
    return () => {
      active = false;
    };
  }, [router, op]);

  return (
    <main className="nr-app nr-support-page" data-theme={theme} data-mode="rider">
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => router.replace("/")} aria-label="Back to NexRide">
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE · RIDER</span>
            <h1>{op("Your rides")}</h1>
            <p>{op("Completed and cancelled trips")}</p>
          </div>
          <button
            className="nr-support-icon-btn"
            onClick={async () => {
              const { data } = await supabase.auth.getSession();
              if (data.session) await load(data.session.user.id);
            }}
            aria-label={op("Refresh rides")}
          >
            <Icon name="clock" />
          </button>
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : error ? (
          <section className="nr-support-state" role="alert">
            <span><Icon name="info" size={22} /></span>
            <strong>{op("Rides unavailable")}</strong>
            <p>{error}</p>
            <button
              onClick={async () => {
                const { data } = await supabase.auth.getSession();
                if (data.session) await load(data.session.user.id);
              }}
            >
              Retry
            </button>
          </section>
        ) : rides.length ? (
          <section className="nr-history-list" aria-label={op("Ride activity")}>
            {rides.map((ride) => {
              const amount = rideAmount(ride);
              const cancelled = ride.status === "cancelled" || ride.status === "withdrawn";
              return (
                <button
                  className="nr-history-row"
                  key={ride.id}
                  onClick={() => router.push("/rider/trips/receipt?ride=" + encodeURIComponent(ride.id))}
                >
                  <span className={"nr-history-icon " + (ride.status === "completed" ? "completed" : cancelled ? "cancelled" : "")}>
                    <Icon name={ride.status === "completed" ? "check" : "navigation"} size={19} />
                  </span>
                  <span className="nr-history-copy">
                    <strong>{ride.pickup} → {ride.destination}</strong>
                    <small>{new Date(rideDate(ride)).toLocaleString("en-ET", { dateStyle: "medium", timeStyle: "short" })}</small>
                  </span>
                  <span className="nr-history-side">
                    <strong>{amount.amount === null ? "—" : amount.amount.toLocaleString("en-ET") + " ETB"}</strong>
                    <span className="nr-history-status">{op(formatRideStatus(ride.status))}{amount.amount !== null && !amount.final ? " · estimate" : ""}</span>
                  </span>
                </button>
              );
            })}
          </section>
        ) : (
          <section className="nr-support-state">
            <span><Icon name="clock" size={22} /></span>
            <strong>{op("No rides here yet")}</strong>
            <p>{op("Your completed and cancelled trips will appear here.")}</p>
            <button onClick={() => router.replace("/")}>{op("Book a ride")}</button>
          </section>
        )}
      </div>
      <RiderMenu active="trips" />
    </main>
  );
}

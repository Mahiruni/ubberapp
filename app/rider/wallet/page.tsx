"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import "../../nexride.css";
import "../supporting.css";

type PaymentIssue = {
  id: string;
  pickup_location: string;
  destination_location: string;
  payment_status: "pending" | "failed" | "unknown";
  final_fare_etb: number | string | null;
  estimated_trip_fare_etb: number | string | null;
  created_at: string;
};

const money = (value: number | string | null) => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function RiderWalletPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<PaymentIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace("/auth");
        return;
      }

      const { data: rows, error: queryError } = await supabase
        .from("ride_requests")
        .select("id,pickup_location,destination_location,payment_status,final_fare_etb,estimated_trip_fare_etb,created_at")
        .eq("rider_id", session.user.id)
        .in("payment_status", ["pending", "failed", "unknown"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (!active) return;
      if (queryError) setError("Payment status could not be loaded.");
      else setIssues((rows || []) as PaymentIssue[]);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setError("Payment information could not be loaded.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="nr-app nr-support-page" data-theme="dark" data-mode="rider">
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => router.replace("/")} aria-label="Back to NexRide">
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE RIDER</span>
            <h1>Wallet & payments</h1>
            <p>Supported payment methods only</p>
          </div>
          <span />
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : (
          <>
            {error && <div className="nr-support-feedback" role="alert"><Icon name="info" size={16} /><span>{error}</span></div>}

            <section className="nr-support-card nr-wallet-balance">
              <small>Stored wallet balance</small>
              <strong>Not available</strong>
              <p>NexRide does not currently maintain a rider stored-value wallet. No balance is shown as zero because that could be mistaken for a real financial balance.</p>
            </section>

            <section className="nr-support-card">
              <div className="nr-payment-method">
                <span className="nr-payment-method-icon"><Icon name="money" size={19} /></span>
                <span>
                  <strong>Cash</strong>
                  <small>Pay the driver in cash according to the confirmed trip amount.</small>
                </span>
                <span className="nr-payment-selected">SUPPORTED</span>
              </div>
              <div className="nr-payment-notice">
                Cash is currently the only connected rider payment method. NexRide does not collect or store raw card details, and card/mobile-money setup is not shown until a real payment provider is integrated.
              </div>
            </section>

            <section className="nr-support-card nr-payment-issues">
              <div className="nr-payment-notice">
                <strong>Payment status</strong><br />
                Pending or failed statuses below come from actual trip records. Cash selection itself does not require a network authorization step.
              </div>

              {issues.length ? issues.map((ride) => {
                const amount = money(ride.final_fare_etb) ?? money(ride.estimated_trip_fare_etb);
                return (
                  <button
                    key={ride.id}
                    className={"nr-payment-issue-row " + ride.payment_status}
                    onClick={() => router.push("/rider/trips/receipt?ride=" + encodeURIComponent(ride.id))}
                  >
                    <span>
                      {ride.pickup_location} → {ride.destination_location}<br />
                      <small>{new Date(ride.created_at).toLocaleDateString("en-ET")}{amount !== null ? " · " + amount.toLocaleString("en-ET") + " ETB" : ""}</small>
                    </span>
                    <strong>{ride.payment_status}</strong>
                  </button>
                );
              }) : (
                <div className="nr-support-state" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
                  <span><Icon name="check" size={20} /></span>
                  <strong>No unresolved payment statuses</strong>
                  <p>There are no rider trip records currently marked pending, failed, or unknown.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

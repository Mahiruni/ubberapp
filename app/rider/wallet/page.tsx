"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { nexrideApiHeaders } from "../../../lib/nexride-api-auth";
import "../../nexride.css";
import "../supporting.css";

type PaymentIssue = {
  id: string;
  pickup_location: string;
  destination_location: string;
  payment_status: "pending" | "failed" | "unknown";
  payment_method: "cash" | "chapa";
  status: string;
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
  const [onlinePayments, setOnlinePayments] = useState(false);
  const [payingRide, setPayingRide] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;

      if (!session) {
        router.replace("/rider/sign-in");
        return;
      }

      const [{ data: rows, error: queryError }, capabilityResponse] = await Promise.all([
        supabase
          .from("ride_requests")
          .select("id,pickup_location,destination_location,payment_status,payment_method,status,final_fare_etb,estimated_trip_fare_etb,created_at")
        .eq("rider_id", session.user.id)
        .in("payment_status", ["pending", "failed", "unknown"])
          .order("created_at", { ascending: false })
          .limit(20),
        fetch("/api/payments/config", { cache: "no-store" }).catch(() => null),
      ]);

      if (!active) return;
      if (capabilityResponse?.ok) {
        const capability = await capabilityResponse.json().catch(() => null);
        if (active) setOnlinePayments(capability?.enabled === true && capability?.provider === "chapa");
      }
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

  async function payOnline(ride: PaymentIssue) {
    if (!onlinePayments || payingRide) return;
    setError("");
    setPayingRide(ride.id);

    let key = "";
    try {
      key = sessionStorage.getItem("nexride.payment.key." + ride.id) || "";
      if (!key) {
        key = crypto.randomUUID();
        sessionStorage.setItem("nexride.payment.key." + ride.id, key);
      }

      const headers = await nexrideApiHeaders(true);
      headers["Idempotency-Key"] = key;
      const response = await fetch("/api/payments/chapa/initialize", {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({ rideRequestId: ride.id }),
      });
      const body = await response.json().catch(() => null);

      if (
        response.ok &&
        body?.status === "ready" &&
        typeof body.checkoutUrl === "string" &&
        /^https:\/\//i.test(body.checkoutUrl)
      ) {
        window.location.assign(body.checkoutUrl);
        return;
      }

      if (body?.status === "already_paid") {
        router.push("/rider/trips/receipt?ride=" + encodeURIComponent(ride.id));
        return;
      }

      setError(
        body?.status === "not_configured"
          ? "Online payment is not configured yet. Cash remains available."
          : "Online payment could not be started. Your ride remains unchanged.",
      );
    } catch {
      setError("Online payment could not be started. Check your connection and try again.");
    } finally {
      setPayingRide("");
    }
  }

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
              {onlinePayments && (
                <div className="nr-payment-method">
                  <span className="nr-payment-method-icon"><Icon name="card" size={19} /></span>
                  <span>
                    <strong>Online payment · Chapa</strong>
                    <small>Available for completed rides with an unpaid balance. Checkout is hosted by Chapa.</small>
                  </span>
                  <span className="nr-payment-selected">AVAILABLE</span>
                </div>
              )}
              <div className="nr-payment-notice">
                {onlinePayments
                  ? "NexRide never collects or stores raw card details. Online checkout opens on Chapa and payment is marked paid only after server-side verification."
                  : "Cash is currently the only enabled rider payment method. Online payment stays hidden until a real payment provider and webhook secret are configured."}
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
                  <article
                    key={ride.id}
                    className={"nr-payment-issue-row " + ride.payment_status}
                  >
                    <button
                      type="button"
                      className="nr-payment-issue-main"
                      onClick={() => router.push("/rider/trips/receipt?ride=" + encodeURIComponent(ride.id))}
                    >
                      <span>
                        {ride.pickup_location} → {ride.destination_location}<br />
                        <small>{new Date(ride.created_at).toLocaleDateString("en-ET")}{amount !== null ? " · " + amount.toLocaleString("en-ET") + " ETB" : ""}</small>
                      </span>
                      <strong>{ride.payment_status}</strong>
                    </button>
                    {onlinePayments && ride.status === "completed" && (
                      <button
                        type="button"
                        className="nr-payment-pay-button"
                        disabled={payingRide === ride.id}
                        aria-busy={payingRide === ride.id || undefined}
                        onClick={() => void payOnline(ride)}
                      >
                        {payingRide === ride.id && <span className="nr-spinner" aria-hidden="true" />}
                        {payingRide === ride.id ? "Opening…" : "Pay online"}
                      </button>
                    )}
                  </article>
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

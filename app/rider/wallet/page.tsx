"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../components/nexride/ui";
import { RiderBottomNavigation, usePersistedRiderTheme } from "../../../components/nexride/rider-bottom-nav";
import { useOperationalTranslation } from "../../../components/nexride/operational-i18n";
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
  const theme = usePersistedRiderTheme();
  const op = useOperationalTranslation();
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
      if (queryError) setError(op("Payment status could not be loaded."));
      else setIssues((rows || []) as PaymentIssue[]);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setError(op("Payment information could not be loaded."));
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
      setError(op("Online payment could not be started. Check your connection and try again."));
    } finally {
      setPayingRide("");
    }
  }

  return (
    <main className="nr-app nr-support-page" data-theme={theme} data-mode="rider">
      <div className="nr-support-wrap">
        <header className="nr-support-head">
          <button className="nr-support-back" onClick={() => router.replace("/")} aria-label="Back to NexRide">
            <Icon name="back" />
          </button>
          <div>
            <span className="kicker">NEXRIDE · RIDER</span>
            <h1>{op("Payments")}</h1>
            <p>{op("Choose how you pay for your rides.")}</p>
          </div>
          <span />
        </header>

        {loading ? (
          <div className="nr-support-loading" aria-busy="true"><span /><span /><span /></div>
        ) : (
          <>
            {error && <div className="nr-support-feedback" role="alert"><Icon name="info" size={16} /><span>{error}</span></div>}

            <section className="nr-support-card">
              <div className="nr-payment-method">
                <span className="nr-payment-method-icon"><Icon name="money" size={19} /></span>
                <span>
                  <strong>{op("Cash")}</strong>
                  <small>{op("Pay the driver after your trip.")}</small>
                </span>
                <span className="nr-payment-selected">{op("SUPPORTED")}</span>
              </div>
              {onlinePayments && (
                <div className="nr-payment-method">
                  <span className="nr-payment-method-icon"><Icon name="card" size={19} /></span>
                  <span>
                    <strong>{op("Online payment · Chapa")}</strong>
                    <small>{op("Available for completed rides that still need payment.")}</small>
                  </span>
                  <span className="nr-payment-selected">{op("AVAILABLE")}</span>
                </div>
              )}
              <div className="nr-payment-notice">
                {onlinePayments
                  ? op("Online checkout opens securely with Chapa. NexRide marks a payment confirmed only after verification.")
                  : op("Cash is currently available. Online payment appears only when it is enabled for your ride.")}
              </div>
            </section>

            <section className="nr-support-card nr-payment-issues">
              <div className="nr-payment-notice">
                <strong>{op("Payment status")}</strong><br />
                {op("Trips that need payment attention appear below.")}
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
                        {payingRide === ride.id ? op("Opening…") : op("Pay online")}
                      </button>
                    )}
                  </article>
                );
              }) : (
                <div className="nr-support-state" style={{ border: 0, borderRadius: 0, background: "transparent" }}>
                  <span><Icon name="check" size={20} /></span>
                  <strong>{op("No payment issues")}</strong>
                  <p>{op("There are no trips waiting for payment attention.")}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <RiderBottomNavigation active="profile" />
    </main>
  );
}

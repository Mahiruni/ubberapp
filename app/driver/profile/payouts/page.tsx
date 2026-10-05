"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { supabase } from "../../../../lib/supabase";
import { formatEtb } from "../../../../lib/nexride-driver-earnings";
import { loadDriverProfileData } from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";

type PayoutEntry = {
  id: string;
  amount_etb: number | string;
  status: "pending" | "processing" | "paid" | "void" | string;
  effective_at: string;
  label: string | null;
};

const amount = (value: number | string) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function DriverPayoutsPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<PayoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountRestricted, setAccountRestricted] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const profile = await loadDriverProfileData(session.user.id);
      if (profile.role !== "driver") {
        router.replace("/auth");
        return;
      }

      setAccountRestricted(profile.accountStatus !== "active");

      const { data: payouts, error: payoutError } = await supabase
        .from("driver_earnings_ledger")
        .select("id,amount_etb,status,effective_at,label")
        .eq("driver_id", session.user.id)
        .eq("entry_type", "payout")
        .order("effective_at", { ascending: false })
        .limit(20);

      if (!active) return;
      if (payoutError) setError("NexRide could not load payout status.");
      else setEntries((payouts || []) as PayoutEntry[]);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setError("NexRide could not load payout information.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const totals = useMemo(() => {
    let paid = 0;
    let pending = 0;
    for (const entry of entries) {
      if (entry.status === "paid") paid += amount(entry.amount_etb);
      if (entry.status === "pending" || entry.status === "processing") pending += amount(entry.amount_etb);
    }
    return { paid, pending };
  }, [entries]);

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver" data-theme="dark">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label="Back to driver profile">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">DRIVER PROFILE</span>
            <h1>Payouts</h1>
            <p>Real payout ledger status only</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide" /><span className="panel" /></div>
        ) : (
          <>
            {error && <div className="nr-profile-alert"><Icon name="info" size={17} /><span>{error}</span></div>}
            {accountRestricted && <div className="nr-profile-alert"><Icon name="info" size={17} /><span>Payout-related actions may be restricted while your driver account is not active.</span></div>}

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Payout status</h2>
                  <p>NexRide currently records payout ledger states, but a driver bank/mobile-money setup and withdrawal flow is not enabled in this app yet.</p>
                </div>
              </div>

              <div className="nr-vehicle-detail-grid">
                <div className="nr-vehicle-detail"><span>Paid out</span><strong>{formatEtb(totals.paid)} ETB</strong></div>
                <div className="nr-vehicle-detail"><span>Pending / processing</span><strong>{formatEtb(totals.pending)} ETB</strong></div>
              </div>

              <div className="nr-profile-locked-note">
                <Icon name="wallet" size={17} />
                <span>No bank account, card, or mobile-money credentials are collected here because NexRide does not yet have a connected payout setup flow. This prevents presenting an unsupported financial action.</span>
              </div>

              <div className="nr-doc-actions">
                <button className="nr-doc-primary" onClick={() => router.push("/driver/earnings/report")}>
                  <Icon name="money" size={16} /> View detailed earnings report
                </button>
              </div>
            </section>

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div><h2>Recent payout entries</h2><p>Only actual ledger entries appear here.</p></div>
                <span className="nr-driver-kicker">{entries.length} RECORDS</span>
              </div>

              <div className="nr-payout-status-list">
                {entries.length ? entries.map((entry) => (
                  <div className="nr-payout-status-row" key={entry.id}>
                    <div>
                      <span>{entry.label || "Payout"}</span>
                      <small>{new Date(entry.effective_at).toLocaleDateString("en-ET")}</small>
                    </div>
                    <div>
                      <strong>{formatEtb(amount(entry.amount_etb), 2)} ETB</strong>
                      <small>{entry.status}</small>
                    </div>
                  </div>
                )) : (
                  <div className="nr-report-ledger-empty">No payout entries have been recorded yet.</div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { supabase } from "../../../../lib/supabase";
import {
  EARNINGS_PERIOD_STORAGE_KEY,
  earningsPeriodLabel,
  formatEtb,
  formatOnlineTime,
  loadDriverEarningsReport,
  type DriverEarningsReport,
  type EarningsPeriod,
} from "../../../../lib/nexride-driver-earnings";
import "../../../nexride.css";
import "../earnings.css";

function isPeriod(value: string | null): value is EarningsPeriod {
  return value === "today" || value === "week" || value === "month" || value === "30d";
}

function entryLabel(type: string) {
  if (type === "gross_fare") return "Gross fare";
  if (type === "driver_earning") return "Driver earning";
  if (type === "deduction") return "Deduction";
  if (type === "adjustment") return "Adjustment";
  return "Payout";
}

export default function DriverEarningsReportPage() {
  const router = useRouter();
  const [report, setReport] = useState<DriverEarningsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!active) return;
      if (!session || session.user.user_metadata?.role !== "driver") {
        router.replace("/driver/auth");
        return;
      }

      const stored = window.localStorage.getItem(EARNINGS_PERIOD_STORAGE_KEY);
      const period: EarningsPeriod = isPeriod(stored) ? stored : "today";

      try {
        const next = await loadDriverEarningsReport(session.user.id, period);
        if (!active) return;
        setReport(next);
        if (next.failed) setError("The detailed report could not be loaded from the reporting service.");
      } catch {
        if (active) setError("The detailed earnings report is temporarily unavailable.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="nr-app nr-earnings-report-page" data-mode="driver" data-theme="dark">
      <div className="nr-earnings-report-wrap">
        <header className="nr-earnings-report-head">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home")} aria-label="Back to driver earnings">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">DRIVER EARNINGS</span>
            <h1>Detailed report</h1>
            <p>{report ? earningsPeriodLabel(report.period) : "Reporting period"}</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-earnings-loading" aria-busy="true"><span className="large" /><span /><span /><span /></div>
        ) : error && !report ? (
          <section className="nr-earnings-state error" role="alert">
            <span><Icon name="info" size={22} /></span>
            <div><strong>Report unavailable</strong><p>{error}</p></div>
          </section>
        ) : report ? (
          <>
            {report.partial && (
              <section className="nr-earnings-state partial">
                <span><Icon name="info" size={20} /></span>
                <div>
                  <strong>Partial report</strong>
                  <p>Some completed trips do not yet have finalized earnings entries, or one reporting source is unavailable. Recorded figures are shown without substituting estimated fares.</p>
                </div>
              </section>
            )}

            <section className="nr-report-summary-grid" aria-label="Financial summary">
              <ReportCard label="Net driver earnings" value={report.netDriverEarningsEtb} note="Posted earnings + adjustments − deductions" />
              <ReportCard label="Gross fares" value={report.grossFaresEtb} note="Recorded rider fare entries only" />
              <ReportCard label="Deductions" value={report.deductionsEtb} note="Posted deductions" />
              <ReportCard label="Adjustments" value={report.adjustmentsEtb} note="Posted earnings adjustments" />
              <ReportCard label="Paid-out funds" value={report.paidOutEtb} note="Payout entries marked paid" />
              <ReportCard label="Pending payout" value={report.pendingPayoutEtb} note="Pending or processing payouts" />
            </section>

            <section className="nr-report-section">
              <div className="nr-report-section-head"><h2>Activity</h2><span>{earningsPeriodLabel(report.period)}</span></div>
              <div className="nr-report-row"><span>Trips completed</span><strong>{report.completedTrips ?? "—"}</strong></div>
              <div className="nr-report-row"><span>Recorded online time</span><strong>{formatOnlineTime(report.onlineSeconds)}</strong></div>
              <div className="nr-report-row"><span>Average net earnings / trip</span><strong>{report.averagePerTripEtb === null ? "—" : `${formatEtb(report.averagePerTripEtb)} ETB`}</strong></div>
            </section>

            <section className="nr-report-section">
              <div className="nr-report-section-head"><h2>Deductions & adjustments</h2><span>Finalized entries</span></div>
              <div className="nr-report-row negative"><span>Total deductions</span><strong>− {formatEtb(report.deductionsEtb)} ETB</strong></div>
              <div className="nr-report-row positive"><span>Total adjustments</span><strong>+ {formatEtb(report.adjustmentsEtb)} ETB</strong></div>
            </section>

            <section className="nr-report-section">
              <div className="nr-report-section-head"><h2>Ledger activity</h2><span>{report.ledger.length} entries</span></div>
              <div className="nr-report-ledger">
                {report.ledger.length ? [...report.ledger].reverse().map((entry) => (
                  <div className="nr-report-ledger-item" key={entry.id}>
                    <strong>{entry.label || entryLabel(entry.entryType)}</strong>
                    <span>{entry.entryType === "deduction" ? "− " : entry.entryType === "adjustment" || entry.entryType === "driver_earning" ? "+ " : ""}{formatEtb(entry.amountEtb, 2)} ETB</span>
                    <small>{new Date(entry.effectiveAt).toLocaleString("en-ET")} · {entry.status}</small>
                  </div>
                )) : (
                  <div className="nr-report-ledger-empty">No financial ledger entries were recorded for this period.</div>
                )}
              </div>
            </section>

            <div className="nr-report-note">
              “Net driver earnings” is not the same as gross rider fare, available balance, or paid-out funds. Available-balance withdrawals and exports are not currently enabled in NexRide, so this screen does not show inactive payout or export controls. Online time reflects recorded availability sessions.
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

function ReportCard({ label, value, note }: { label: string; value: number | null; note: string }) {
  return (
    <div className="nr-report-summary-card">
      <span>{label}</span>
      <strong>{formatEtb(value)} <small>ETB</small></strong>
      <small>{note}</small>
    </div>
  );
}

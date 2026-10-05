"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "./ui";
import {
  EARNINGS_PERIOD_STORAGE_KEY,
  earningsPeriodLabel,
  formatEtb,
  formatOnlineTime,
  loadDriverEarningsReport,
  type DriverEarningsReport,
  type EarningsLedgerEntry,
  type EarningsPeriod,
} from "../../lib/nexride-driver-earnings";
import "../../app/driver/earnings/earnings.css";

const PERIODS: { id: EarningsPeriod; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "30d", label: "30 days" },
];

function isPeriod(value: string | null): value is EarningsPeriod {
  return value === "today" || value === "week" || value === "month" || value === "30d";
}

function chartNet(entry: EarningsLedgerEntry) {
  if (entry.status !== "posted" && entry.status !== "paid") return 0;
  if (entry.entryType === "driver_earning" || entry.entryType === "adjustment") return entry.amountEtb;
  if (entry.entryType === "deduction") return -entry.amountEtb;
  return 0;
}

function buildChart(report: DriverEarningsReport) {
  const bucketCount = report.period === "today" ? 6 : 7;
  const span = Math.max(1, report.end.getTime() - report.start.getTime());
  const bucketMs = span / bucketCount;
  const values = Array.from({ length: bucketCount }, () => 0);

  for (const entry of report.ledger) {
    const time = new Date(entry.effectiveAt).getTime();
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor((time - report.start.getTime()) / bucketMs)));
    values[index] += chartNet(entry);
  }

  const labels = values.map((_, index) => {
    const date = new Date(report.start.getTime() + bucketMs * (index + 0.5));
    return report.period === "today"
      ? date.toLocaleTimeString("en-ET", { hour: "numeric" })
      : date.toLocaleDateString("en-ET", { month: "short", day: "numeric" });
  });

  return { values, labels };
}

export function DriverEarningsScreen({
  driverId,
  onBack,
  onOpenReport,
}: {
  driverId: string;
  onBack: () => void;
  onOpenReport: () => void;
}) {
  const [period, setPeriod] = useState<EarningsPeriod>("today");
  const [report, setReport] = useState<DriverEarningsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failedMessage, setFailedMessage] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const saved = window.localStorage.getItem(EARNINGS_PERIOD_STORAGE_KEY);
    if (isPeriod(saved)) setPeriod(saved);
  }, []);

  useEffect(() => {
    if (!driverId) return;
    let active = true;
    setLoading(true);
    setFailedMessage("");

    loadDriverEarningsReport(driverId, period)
      .then((next) => {
        if (!active) return;
        setReport(next);
        if (next.failed) setFailedMessage("NexRide could not load earnings, trip, or online-time reporting.");
      })
      .catch(() => {
        if (!active) return;
        setReport(null);
        setFailedMessage("NexRide could not load your earnings report.");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [driverId, period, retryNonce]);

  const changePeriod = (next: EarningsPeriod) => {
    setPeriod(next);
    window.localStorage.setItem(EARNINGS_PERIOD_STORAGE_KEY, next);
  };

  const chart = useMemo(() => report ? buildChart(report) : null, [report]);
  const hasCompletedTrips = (report?.completedTrips || 0) > 0;
  const emptyPeriod =
    !loading &&
    !failedMessage &&
    report &&
    report.completedTrips === 0 &&
    report.ledger.length === 0 &&
    (report.onlineSeconds || 0) === 0;

  return (
    <>
      <header className="nr-earnings-head">
        <div>
          <span className="nr-driver-kicker">NEXRIDE DRIVER</span>
          <h1>Earnings</h1>
        </div>
        <button className="nr-driver-icon-btn" onClick={onBack} aria-label="Back to driver home">
          <Icon name="back" />
        </button>
      </header>

      <div className="nr-earnings-periods" role="group" aria-label="Reporting period">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            className={period === item.id ? "active" : ""}
            onClick={() => changePeriod(item.id)}
            aria-pressed={period === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="nr-earnings-loading" aria-busy="true" aria-label="Loading earnings report">
          <span className="large" /><span /><span /><span />
        </div>
      ) : failedMessage ? (
        <section className="nr-earnings-state error" role="alert">
          <span><Icon name="info" size={22} /></span>
          <div>
            <strong>Report unavailable</strong>
            <p>{failedMessage}</p>
            <button onClick={() => setRetryNonce((value) => value + 1)}>Try again</button>
          </div>
        </section>
      ) : report ? (
        <>
          <section className="nr-earnings-total-card">
            <div className="nr-earnings-total-top">
              <div>
                <span>{earningsPeriodLabel(period)}</span>
                <small>{report.earningsPartial ? "Recorded net driver earnings · partial" : "Net driver earnings"}</small>
              </div>
              {report.partial && <span className="nr-earnings-partial-badge">PARTIAL DATA</span>}
            </div>

            <strong className="nr-earnings-total">
              {formatEtb(report.netDriverEarningsEtb)}
              <small> ETB</small>
            </strong>

            <p className="nr-earnings-definition">
              Net driver earnings = posted driver earnings + adjustments − deductions. This is not gross rider fare, available wallet balance, or paid-out funds.
            </p>

            {chart && <EarningsChart report={report} values={chart.values} labels={chart.labels} />}
          </section>

          {emptyPeriod ? (
            <section className="nr-earnings-state empty">
              <span><Icon name="money" size={22} /></span>
              <div>
                <strong>No activity in this period</strong>
                <p>No completed trips, earnings entries, or recorded online time were found for {earningsPeriodLabel(period).toLowerCase()}.</p>
              </div>
            </section>
          ) : report.earningsPartial && hasCompletedTrips ? (
            <section className="nr-earnings-state partial">
              <span><Icon name="info" size={20} /></span>
              <div>
                <strong>Earnings data is incomplete</strong>
                <p>Completed trips exist in this period, but one or more finalized driver-earning entries are not yet recorded. NexRide is not substituting estimated fares.</p>
              </div>
            </section>
          ) : report.sourceErrors.length > 0 ? (
            <section className="nr-earnings-state partial">
              <span><Icon name="info" size={20} /></span>
              <div>
                <strong>Some report data is unavailable</strong>
                <p>Unavailable: {report.sourceErrors.join(", ")}. Available metrics below are still live.</p>
              </div>
            </section>
          ) : null}

          <div className="nr-earnings-metrics">
            <MetricCard label="Trips completed" value={report.completedTrips === null ? "—" : String(report.completedTrips)} hint="Completed in period" icon="car" />
            <MetricCard label="Online time" value={formatOnlineTime(report.onlineSeconds)} hint="Recorded sessions" icon="clock" />
            <MetricCard label="Avg. per trip" value={report.averagePerTripEtb === null ? "—" : `${formatEtb(report.averagePerTripEtb)} ETB`} hint={report.earningsPartial ? "Unavailable while partial" : "Net earnings"} icon="money" />
          </div>

          <button className="nr-earnings-report-action" onClick={onOpenReport}>
            <span><Icon name="wallet" size={19} /><strong>View detailed report</strong></span>
            <Icon name="chevron" size={17} />
          </button>
        </>
      ) : null}
    </>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  icon: "car" | "clock" | "money";
}) {
  return (
    <section className="nr-earnings-metric">
      <span className="nr-earnings-metric-icon"><Icon name={icon} size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{hint}</em>
    </section>
  );
}

function EarningsChart({
  report,
  values,
  labels,
}: {
  report: DriverEarningsReport;
  values: number[];
  labels: string[];
}) {
  const width = 360;
  const height = 112;
  const top = 12;
  const bottom = 88;
  const max = Math.max(1, ...values.map((value) => Math.max(0, value)));
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((value, index) => ({
    x: index * step,
    y: bottom - (Math.max(0, value) / max) * (bottom - top),
  }));
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const summary = values.map((value, index) => `${labels[index]}: ${formatEtb(value)} ETB`).join("; ");

  return (
    <figure className="nr-earnings-chart">
      <div className="nr-earnings-chart-head">
        <span>Recorded earnings trend</span>
        <small>{report.earningsPartial ? "Partial" : "Finalized entries"}</small>
      </div>
      {values.every((value) => value === 0) ? (
        <div className="nr-earnings-chart-empty">No recorded earnings entries to plot.</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="nr-earnings-chart-title nr-earnings-chart-desc">
          <title id="nr-earnings-chart-title">Net driver earnings trend</title>
          <desc id="nr-earnings-chart-desc">{summary}</desc>
          <path d={path} className="nr-earnings-chart-line" />
          {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.5" className="nr-earnings-chart-dot" />)}
        </svg>
      )}
      <div className="nr-earnings-chart-labels" aria-hidden="true">
        <span>{labels[0]}</span>
        <span>{labels[Math.floor(labels.length / 2)]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
      <p className="nr-earnings-chart-summary">Chart summary: {summary}</p>
    </figure>
  );
}

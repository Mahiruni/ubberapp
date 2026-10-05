import { supabase } from "./supabase";

export type EarningsPeriod = "today" | "week" | "month" | "30d";
export const EARNINGS_PERIOD_STORAGE_KEY = "nexride.driver.earnings.period";

export type EarningsLedgerEntry = {
  id: string;
  rideRequestId: string | null;
  entryType: "gross_fare" | "driver_earning" | "deduction" | "adjustment" | "payout";
  amountEtb: number;
  status: "pending" | "posted" | "processing" | "paid" | "void";
  label: string;
  effectiveAt: string;
};

export type DriverEarningsReport = {
  period: EarningsPeriod;
  start: Date;
  end: Date;
  ledger: EarningsLedgerEntry[];
  completedTrips: number | null;
  onlineSeconds: number | null;
  grossFaresEtb: number | null;
  netDriverEarningsEtb: number | null;
  deductionsEtb: number | null;
  adjustmentsEtb: number | null;
  paidOutEtb: number | null;
  pendingPayoutEtb: number | null;
  averagePerTripEtb: number | null;
  earningsPartial: boolean;
  partial: boolean;
  failed: boolean;
  sourceErrors: string[];
};

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export function getEarningsPeriodWindow(period: EarningsPeriod, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "week") {
    const day = start.getDay();
    const daysSinceMonday = (day + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else {
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
  }

  return { start, end };
}

export function earningsPeriodLabel(period: EarningsPeriod) {
  if (period === "today") return "Today";
  if (period === "week") return "This week";
  if (period === "month") return "This month";
  return "Last 30 days";
}

export function formatEtb(value: number | null, decimals = 0) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatOnlineTime(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return "<1 min";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours}h ${minutes}m`;
}

export async function loadDriverEarningsReport(
  driverId: string,
  period: EarningsPeriod,
): Promise<DriverEarningsReport> {
  const { start, end } = getEarningsPeriodWindow(period);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [ledgerResult, tripsResult, sessionsResult] = await Promise.all([
    supabase
      .from("driver_earnings_ledger")
      .select("id,ride_request_id,entry_type,amount_etb,status,label,effective_at")
      .eq("driver_id", driverId)
      .gte("effective_at", startIso)
      .lte("effective_at", endIso)
      .order("effective_at", { ascending: true }),
    supabase
      .from("ride_requests")
      .select("id,completed_at")
      .eq("assigned_driver_id", driverId)
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lte("completed_at", endIso),
    supabase
      .from("driver_online_sessions")
      .select("started_at,ended_at")
      .eq("driver_id", driverId)
      .lte("started_at", endIso)
      .or(`ended_at.is.null,ended_at.gte.${startIso}`),
  ]);

  const sourceErrors: string[] = [];
  if (ledgerResult.error) sourceErrors.push("earnings");
  if (tripsResult.error) sourceErrors.push("trips");
  if (sessionsResult.error) sourceErrors.push("online time");

  const ledger: EarningsLedgerEntry[] = ledgerResult.error
    ? []
    : (ledgerResult.data || []).map((row) => ({
        id: row.id,
        rideRequestId: row.ride_request_id,
        entryType: row.entry_type,
        amountEtb: toNumber(row.amount_etb),
        status: row.status,
        label: row.label || "",
        effectiveAt: row.effective_at,
      }));

  const completedTripRows = tripsResult.error ? null : tripsResult.data || [];
  const completedTrips = completedTripRows === null ? null : completedTripRows.length;

  let onlineSeconds: number | null = null;
  if (!sessionsResult.error) {
    onlineSeconds = (sessionsResult.data || []).reduce((total, session) => {
      const sessionStart = Math.max(new Date(session.started_at).getTime(), start.getTime());
      const rawEnd = session.ended_at ? new Date(session.ended_at).getTime() : end.getTime();
      const sessionEnd = Math.min(rawEnd, end.getTime());
      return total + Math.max(0, (sessionEnd - sessionStart) / 1000);
    }, 0);
  }

  const finalized = ledger.filter((entry) => entry.status === "posted" || entry.status === "paid");
  const sum = (type: EarningsLedgerEntry["entryType"]) =>
    finalized.filter((entry) => entry.entryType === type).reduce((total, entry) => total + entry.amountEtb, 0);

  const grossFares = ledgerResult.error ? null : sum("gross_fare");
  const driverEarnings = ledgerResult.error ? null : sum("driver_earning");
  const deductions = ledgerResult.error ? null : sum("deduction");
  const adjustments = ledgerResult.error ? null : sum("adjustment");
  const paidOut = ledgerResult.error
    ? null
    : ledger.filter((entry) => entry.entryType === "payout" && entry.status === "paid")
        .reduce((total, entry) => total + entry.amountEtb, 0);
  const pendingPayout = ledgerResult.error
    ? null
    : ledger.filter((entry) => entry.entryType === "payout" && (entry.status === "pending" || entry.status === "processing"))
        .reduce((total, entry) => total + entry.amountEtb, 0);

  const earningRideIds = new Set(
    finalized
      .filter((entry) => entry.entryType === "driver_earning" && entry.rideRequestId)
      .map((entry) => entry.rideRequestId as string),
  );
  const completedRideIds = completedTripRows?.map((row) => row.id) || [];
  const missingCompletedRideEarnings = completedRideIds.some((id) => !earningRideIds.has(id));
  const earningsPartial =
    Boolean(ledgerResult.error) ||
    Boolean(tripsResult.error) ||
    missingCompletedRideEarnings;

  let netDriverEarnings: number | null = null;
  if (!ledgerResult.error) {
    const recordedNet = (driverEarnings || 0) + (adjustments || 0) - (deductions || 0);
    if (!earningsPartial || ledger.length > 0 || completedTrips === 0) {
      netDriverEarnings = recordedNet;
    }
  }

  const averagePerTrip =
    completedTrips && completedTrips > 0 && netDriverEarnings !== null && !earningsPartial
      ? netDriverEarnings / completedTrips
      : completedTrips === 0 && !earningsPartial
        ? 0
        : null;

  return {
    period,
    start,
    end,
    ledger,
    completedTrips,
    onlineSeconds,
    grossFaresEtb: grossFares,
    netDriverEarningsEtb: netDriverEarnings,
    deductionsEtb: deductions,
    adjustmentsEtb: adjustments,
    paidOutEtb: paidOut,
    pendingPayoutEtb: pendingPayout,
    averagePerTripEtb: averagePerTrip,
    earningsPartial,
    partial: sourceErrors.length > 0 || earningsPartial,
    failed: sourceErrors.length === 3,
    sourceErrors,
  };
}

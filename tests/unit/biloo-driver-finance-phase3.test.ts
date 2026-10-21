import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  earningsPeriodLabel,
  getEarningsPeriodWindow,
  formatEtb,
} from "../../lib/nexride-driver-earnings";

describe("Biloo Phase 3 — driver financial separation", () => {
  it("supports a lifetime earnings window without changing today and month boundaries", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const all = getEarningsPeriodWindow("all", now);
    expect(all.start.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(all.end.toISOString()).toBe(now.toISOString());
    expect(earningsPeriodLabel("all")).toBe("Lifetime");
  });

  it("does not turn null financial values into confirmed zeros", () => {
    expect(formatEtb(null)).toBe("—");
    expect(formatEtb(0, 2)).toMatch(/0[.,]00/);
  });

  it("does not call a payment provider from the settlement page", () => {
    const source = readFileSync("app/driver/profile/payouts/page.tsx","utf8");
    expect(source).toContain('from("driver_settlement_preferences")');
    expect(source).toContain("loadDriverEarningsReport");
    expect(source).not.toContain("/api/driver/payouts");
    expect(source).not.toContain("initiateChapaPayout");
    expect(source).not.toContain("PAYMENT_SECRET_KEY");
    expect(source).not.toContain("accountNumber");
    expect(source).not.toContain("requestPayout");
  });

  it("keeps cash outstanding separate from paid and gross fare ledger entries", () => {
    const source = readFileSync("lib/nexride-driver-earnings.ts","utf8");
    expect(source).toContain('row.payment_method === "cash" && row.payment_status === "paid"');
    expect(source).toContain('row.payment_method === "cash" && row.payment_status !== "paid"');
    expect(source).toContain("cashFaresPendingEtb");
    expect(source).toContain("commissionEtb: null");
    expect(source).toContain("finalizedDriverEarningsEntries > 0");
  });

  it("enforces driver ownership with read/write policies on non-financial preferences", () => {
    const sql = readFileSync("supabase/migrations/20261021211500_biloo_driver_settlement_preferences.sql","utf8");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("driver_id = (select auth.uid())");
    expect(sql).toContain("for insert to authenticated");
    expect(sql).toContain("for update to authenticated");
    expect(sql).not.toContain("account_number");
    expect(sql).not.toContain("payment_provider");
  });

  it("exports real ledger rows and not a payment verification", () => {
    const source=readFileSync("app/driver/earnings/report/page.tsx","utf8");
    expect(source).toContain("report.ledger.map");
    expect(source).toContain("CSV");
    expect(source).toContain("Statement is informational");
    expect(source).toContain("safe.replace");
  });
});

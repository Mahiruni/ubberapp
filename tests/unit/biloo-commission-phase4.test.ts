import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatMinorEtb, parseEtbMinor, previewCommission, validateCommissionDraft } from "../../lib/biloo-commission-engine";

const rule={
 rideCategory:"economy",commissionBps:1500,fixedFeeMinor:200,
 discountBps:0,incentiveMinor:0,taxBps:0,
 effectiveFrom:"2027-01-01T00:00:00Z",note:"Proposed rate",
};
describe("Biloo Phase 4: deterministic commission and safe activation",()=>{
 it("converts decimal ETB precisely and rejects extra decimal precision",()=>{
  expect(parseEtbMinor("300.10")).toBe(30010n);
  expect(parseEtbMinor("0.01")).toBe(1n);
  expect(formatMinorEtb(-1299n)).toBe("-12.99");
  expect(()=>parseEtbMinor("100.001")).toThrow("INVALID_ETB_AMOUNT");
  expect(()=>parseEtbMinor("-0.01")).toThrow("INVALID_ETB_AMOUNT");
  expect(()=>parseEtbMinor("not-a-number")).toThrow();
 });
 it("calculates a category rule from integer minor units",()=>{
  const r=previewCommission("300.00",rule);
  expect(r.grossEtb).toBe("300.00");
  expect(r.commissionEtb).toBe("47.00");
  expect(r.driverShareEtb).toBe("253.00");
  expect(r.platformNetEtb).toBe("47.00");
 });
 it("applies discount to commission and adds driver incentive separately",()=>{
  const r=previewCommission("100.00",{...rule,commissionBps:1000,fixedFeeMinor:0,discountBps:5000,incentiveMinor:250});
  expect(r.commissionEtb).toBe("5.00");
  expect(r.incentiveEtb).toBe("2.50");
  expect(r.driverShareEtb).toBe("97.50");
  expect(r.platformNetEtb).toBe("2.50");
 });
 it("clamps fees to gross fare and round halves consistently",()=>{
  const r=previewCommission("0.01",{...rule,commissionBps:10000,fixedFeeMinor:250000});
  expect(r.commissionEtb).toBe("0.01");
  expect(r.driverShareEtb).toBe("0.00");
  const round=previewCommission("0.01",{...rule,commissionBps:5000,fixedFeeMinor:0});
  expect(round.commissionEtb).toBe("0.01");
 });
 it("rejects tax until compliance review and prevents malformed rates",()=>{
  expect(()=>previewCommission("100.00",{...rule,taxBps:1500})).toThrow("TAX_REQUIRES_REVIEW");
  expect(()=>validateCommissionDraft({...rule,commissionBps:10001})).toThrow();
  expect(()=>validateCommissionDraft({...rule,commissionBps:1.5})).toThrow();
  expect(()=>validateCommissionDraft({...rule,rideCategory:"economy;delete"})).toThrow();
  expect(validateCommissionDraft(rule).rideCategory).toBe("economy");
 });
 it("keeps commission management backend-only and non-settling",()=>{
  const api=readFileSync("app/api/admin/finance/commissions/route.ts","utf8");
  const sql=readFileSync("supabase/migrations/20261022000500_biloo_commission_revenue_engine.sql","utf8");
  expect(api).toContain("authorizedRequestSupabase");
  expect(api).toContain('admin_role');
  expect(api).toContain("requires_super_admin");
  expect(api).not.toContain("initiateChapaPayment");
  expect(api).not.toContain("initiateChapaPayout");
  expect(sql).toContain("ALTER TABLE public.platform_commission_rules ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("COMMISSION_SNAPSHOT_IMMUTABLE");
  expect(sql).toContain("OLD.status = 'completed'");
  expect(sql).toContain("NEW.final_fare_etb IS NULL");
  expect(sql).not.toContain("UPDATE public.driver_earnings_ledger");
 });
});

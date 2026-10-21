import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  checkBalancedJournal, formatJournalMinor, readMinor,
} from "../../lib/biloo-financial-ledger";

describe("Biloo Phase 5 — immutable balanced accounting foundation",()=>{
 it("computes balanced ETB journals using integer minor units",()=>{
  const result=checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"2501"},
   {account_code:"2100",side:"credit",amount_minor:"2501"},
  ]);
  expect(result.balanced).toBe(true);
  expect(result.amountEtb).toBe("25.01");
  expect(result.debitMinor).toBe(result.creditMinor);
  expect(result.lines).toBe(2);
 });
 it("supports multi-line debit/credit reconciliation precisely",()=>{
  const result=checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"301"},
   {account_code:"2100",side:"credit",amount_minor:"300"},
   {account_code:"4100",side:"credit",amount_minor:"1"},
  ]);
  expect(result.amountEtb).toBe("3.01");
 });
 it("rejects unbalanced or single-sided journals",()=>{
  expect(()=>checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"300"},
   {account_code:"2100",side:"credit",amount_minor:"301"},
  ])).toThrow("BILOO_JOURNAL_NOT_BALANCED");
  expect(()=>checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"300"},
  ])).toThrow();
  expect(()=>checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"300"},
   {account_code:"2100",side:"debit",amount_minor:"300"},
  ])).toThrow();
 });
 it("rejects fractional, negative, zero or oversized minor values",()=>{
  expect(readMinor("1")).toBe(BigInt(1));
  expect(formatJournalMinor(BigInt(-123))).toBe("-1.23");
  for(const v of ["0","-1","1.2","1e2","9999999999999999",""]) {
   expect(()=>readMinor(v)).toThrow("INVALID_MINOR_AMOUNT");
  }
 });
 it("validates journal format and prevents unauthorized posting from the client",()=>{
  expect(()=>checkBalancedJournal([
   {account_code:"1100",side:"debit",amount_minor:"100"},
   {account_code:"INVALID",side:"credit",amount_minor:"100"},
  ])).toThrow("INVALID_ACCOUNT_CODE");
  const api=readFileSync("app/api/admin/finance/ledger/route.ts","utf8");
  expect(api).toContain("authorizedRequestSupabase");
  expect(api).toContain('profile?.role!=="admin"');
  expect(api).toContain("checkBalancedJournal");
  expect(api).not.toContain("biloo_post_financial_journal");
  expect(api).not.toContain("/api/payments/chapa/");
  const ui=readFileSync("app/admin/finance/ledger/page.tsx","utf8");
  expect(ui).toContain("Journal posting disabled");
  expect(ui).toContain("Balanced, not posted");
 });
 it("enforces RLS, hard posting gate, idempotency and deferred journal balances",()=>{
  const sql=readFileSync("supabase/migrations/20261022013000_biloo_phase5_financial_foundation.sql","utf8");
  expect(sql).toContain("posting_enabled = false");
  expect(sql).toContain("financial_journal_commit_balance");
  expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
  expect(sql).toContain("BILOO_FINANCIAL_POSTING_DISABLED");
  expect(sql).toContain("BILOO_JOURNAL_IDEMPOTENCY_CONFLICT");
  expect(sql).toContain("BILOO_FINANCIAL_RECORD_IMMUTABLE");
  expect(sql).toContain("ALTER TABLE public.financial_ledger_entries ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("TO authenticated USING (false) WITH CHECK (false)");
  expect(sql).toContain("REVOKE ALL ON public.");
  expect(sql).not.toContain("UPDATE public.driver_earnings_ledger");
 });
});

/**
 * Commission previews are deterministic integer-minor-unit calculations.
 * They NEVER settle, collect or authorize funds. Database snapshots are
 * independently calculated in PostgreSQL from the same half-up formula.
 */
export type CommissionDraft = {
  rideCategory: string;
  commissionBps: number;
  fixedFeeMinor: number;
  discountBps: number;
  incentiveMinor: number;
  taxBps: number;
  effectiveFrom: string;
  note: string;
};
export function parseEtbMinor(input: unknown): bigint {
  const value = typeof input === "number" ? String(input) : input;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(value.trim()))
    throw new Error("INVALID_ETB_AMOUNT");
  const [units, fraction = ""] = value.trim().split(".");
  return BigInt(units) * 100n + BigInt((fraction + "00").slice(0, 2));
}
export function formatMinorEtb(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return sign + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0");
}
export function validateCommissionDraft(input: unknown): CommissionDraft {
  const r = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string,unknown> : {};
  const ints: (keyof CommissionDraft)[] = ["commissionBps","fixedFeeMinor","discountBps","incentiveMinor","taxBps"];
  for (const key of ints) if (typeof r[key] !== "number" || !Number.isSafeInteger(r[key])) throw new Error("INVALID_COMMISSION_RULE");
  const category = r.rideCategory;
  if (typeof category !== "string" || !/^(\*|[a-z][a-z0-9_]{0,39})$/.test(category))
    throw new Error("INVALID_RIDE_CATEGORY");
  if ((r.commissionBps as number) < 0 || (r.commissionBps as number) > 10000 ||
      (r.discountBps as number) < 0 || (r.discountBps as number) > 10000 ||
      (r.taxBps as number) < 0 || (r.taxBps as number) > 10000 ||
      (r.fixedFeeMinor as number) < 0 || (r.fixedFeeMinor as number) > 100000000 ||
      (r.incentiveMinor as number) < 0 || (r.incentiveMinor as number) > 100000000)
    throw new Error("INVALID_COMMISSION_RULE");
  if (typeof r.effectiveFrom !== "string" || !Number.isFinite(Date.parse(r.effectiveFrom)))
    throw new Error("INVALID_EFFECTIVE_DATE");
  if (typeof r.note !== "string" || r.note.length > 500)
    throw new Error("INVALID_COMMISSION_NOTE");
  return {
    rideCategory: category, commissionBps:r.commissionBps as number,
    fixedFeeMinor:r.fixedFeeMinor as number, discountBps:r.discountBps as number,
    incentiveMinor:r.incentiveMinor as number, taxBps:r.taxBps as number,
    effectiveFrom:new Date(r.effectiveFrom).toISOString(), note:r.note,
  };
}
export function previewCommission(grossFareEtb: unknown, rule: Pick<CommissionDraft,
  "commissionBps"|"fixedFeeMinor"|"discountBps"|"incentiveMinor"|"taxBps">) {
  if (rule.taxBps !== 0) throw new Error("TAX_REQUIRES_REVIEW");
  const gross = parseEtbMinor(grossFareEtb);
  if (gross <= 0n) throw new Error("FARE_MUST_BE_POSITIVE");
  const base = (gross * BigInt(rule.commissionBps) + 5000n) / 10000n + BigInt(rule.fixedFeeMinor);
  const discount = (base * BigInt(rule.discountBps) + 5000n) / 10000n;
  const fee = [gross, base - discount].reduce((a,b)=>a<b?a:b);
  const incentive=BigInt(rule.incentiveMinor);
  return {
    grossMinor: gross.toString(),
    baseFeeMinor: base.toString(),
    discountMinor: discount.toString(),
    commissionMinor: fee.toString(),
    incentiveMinor: incentive.toString(),
    driverShareMinor: (gross-fee+incentive).toString(),
    platformNetMinor: (fee-incentive).toString(),
    grossEtb:formatMinorEtb(gross),
    commissionEtb:formatMinorEtb(fee),
    driverShareEtb:formatMinorEtb(gross-fee+incentive),
    platformNetEtb:formatMinorEtb(fee-incentive),
    discountEtb:formatMinorEtb(discount),
    incentiveEtb:formatMinorEtb(incentive),
    note:"Illustrative only · no payment collection, tax calculation or settlement.",
  };
}

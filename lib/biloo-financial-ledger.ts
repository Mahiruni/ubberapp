/**
 * Internal financial journal preview. This module never posts money or ledger entries.
 * All amounts are ETB integer minor units; no floating point account balances.
 */
export type BilooFinancialSide = "debit" | "credit";
export type BilooLedgerLineInput = {
  account_code: string;
  side: BilooFinancialSide;
  amount_minor: string;
  ride_request_id?: string | null;
  driver_id?: string | null;
};
export function readMinor(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,14}$/.test(value))
    throw new Error("INVALID_MINOR_AMOUNT");
  return BigInt(value);
}
export function formatJournalMinor(value: bigint) {
  const negative = value < BigInt(0) ? "-" : "";
  const n = value < BigInt(0) ? -value : value;
  return negative + (n / BigInt(100)).toString() + "." +
    (n % BigInt(100)).toString().padStart(2, "0");
}
export function checkBalancedJournal(lines: unknown): {
  balanced: true;
  lines: number;
  debitMinor: string;
  creditMinor: string;
  amountEtb: string;
} {
  if (!Array.isArray(lines) || lines.length < 2 || lines.length > 100)
    throw new Error("INVALID_JOURNAL_LINES");
  let debits = BigInt(0);
  let credits = BigInt(0);
  for (const row of lines as unknown[]) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("INVALID_JOURNAL_LINE");
    const item = row as Record<string, unknown>;
    if (item.side !== "debit" && item.side !== "credit")
      throw new Error("INVALID_JOURNAL_SIDE");
    if (typeof item.account_code !== "string" ||
      !/^[1-5][0-9]{3}$/.test(item.account_code))
      throw new Error("INVALID_ACCOUNT_CODE");
    const minor = readMinor(item.amount_minor);
    if (item.side === "debit") debits += minor;
    else credits += minor;
  }
  if (debits === BigInt(0) || credits === BigInt(0) || debits !== credits)
    throw new Error("BILOO_JOURNAL_NOT_BALANCED");
  return {balanced:true, lines:lines.length, debitMinor:debits.toString(),
    creditMinor:credits.toString(),amountEtb:formatJournalMinor(debits)};
}

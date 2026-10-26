import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptPayoutAccountNumber,
  verifyChapaPayout,
} from "./nexride-payouts";
import { payRpc } from "./biloo-pay-server";

export type PayPayout = {
  id: string;
  driver_id: string;
  account_id: string;
  reference: string;
  amount_minor: number;
  mode: "test" | "live";
  status: string;
  bank_code: string;
  account_name: string;
  account_ciphertext: string;
  existing?: boolean;
};
export async function reconcilePayPayout(
  admin: SupabaseClient,
  payout: PayPayout,
) {
  if (["paid", "failed"].includes(payout.status)) return payout.status;
  const verification = await verifyChapaPayout(payout.reference, {
    amountMinor: Number(payout.amount_minor),
    mode: payout.mode,
    bankCode: payout.bank_code,
    accountNumber: decryptPayoutAccountNumber(payout.account_ciphertext),
  });
  if (!verification.evidence) return "verification_required";
  const result = await payRpc(admin, "biloo_pay_finalize_payout_server", {
    p_id: payout.id,
    p_state: verification.evidence.state,
    p_evidence: verification.evidence,
  });
  return String(result.status);
}

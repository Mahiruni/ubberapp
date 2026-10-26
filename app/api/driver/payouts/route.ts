import { randomUUID } from "node:crypto";
import {
  payAccess,
  payBody,
  payError,
  payKey,
  payReply,
  payRpc,
} from "../../../../lib/biloo-pay-server";
import { etbMinor, payUuid } from "../../../../lib/biloo-pay-money";
import {
  reconcilePayPayout,
  type PayPayout,
} from "../../../../lib/biloo-pay-payout-server";
import {
  decryptPayoutAccountNumber,
  encryptPayoutAccountNumber,
  initiateChapaPayout,
  listChapaPayoutBanks,
  maskPayoutAccountNumber,
  normalizePayoutAccountNumber,
  payoutConfiguration,
} from "../../../../lib/nexride-payouts";

export async function GET(request: Request) {
  try {
    const { admin, user } = await payAccess(request, "driver", false);
    const snapshot = await payRpc(admin, "biloo_pay_snapshot_server", {
      p_actor: user.id,
      p_role: "driver",
    });
    const { data: account, error } = await admin
      .from("driver_payout_accounts")
      .select(
        "id,bank_code,bank_name,account_name,account_number_last4,status,updated_at",
      )
      .eq("driver_id", user.id)
      .maybeSingle();
    const { data: driver, error: driverError } = await admin
      .from("drivers")
      .select("review_status")
      .eq("id", user.id)
      .single();
    if (error || driverError) throw Error("BILOO_PAY_SETUP_REQUIRED");
    const config = payoutConfiguration();
    const eligible = driver.review_status === "approved";
    let banks: { code: string; name: string }[] = [],
      banksUnavailable = false;
    if (
      new URL(request.url).searchParams.get("banks") === "1" &&
      config.enabled &&
      eligible
    ) {
      try {
        banks = await listChapaPayoutBanks();
      } catch {
        banksUnavailable = true;
      }
    }
    const balance = snapshot.balance as { availableMinor: number };
    return payReply({
      status: "ready",
      enabled: config.enabled,
      provider: config.provider,
      eligible,
      availableEtb: Number(balance.availableMinor) / 100,
      account: account
        ? {
            id: account.id,
            bankCode: account.bank_code,
            bankName: account.bank_name,
            accountName: account.account_name,
            accountNumberMasked: maskPayoutAccountNumber(
              account.account_number_last4,
            ),
            status: account.status,
            updatedAt: account.updated_at,
          }
        : null,
      banks,
      banksUnavailable,
      requests: (snapshot.payouts as PayPayout[]).map((p) => ({
        id: p.id,
        amountEtb: Number(p.amount_minor) / 100,
        status: p.status,
        providerReference: p.reference,
        createdAt: (p as PayPayout & { created_at: string }).created_at,
      })),
    });
  } catch (error) {
    return payError(error);
  }
}
export async function PUT(request: Request) {
  if (!payoutConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const { admin, user } = await payAccess(request, "driver");
    const { data: driver } = await admin
      .from("drivers")
      .select("review_status")
      .eq("id", user.id)
      .single();
    if (driver?.review_status !== "approved")
      throw Error("BILOO_PAY_FORBIDDEN");
    const body = await payBody(request);
    const number = normalizePayoutAccountNumber(body.accountNumber);
    const name =
      typeof body.accountName === "string" ? body.accountName.trim() : "";
    if (!number || name.length < 2 || name.length > 120)
      return payReply({ status: "invalid_account" }, 400);
    const bank = (await listChapaPayoutBanks()).find(
      (b) => b.code === body.bankCode,
    );
    if (!bank) return payReply({ status: "unsupported_bank" }, 400);
    await payRpc(admin, "biloo_pay_save_account_server", {
      p_actor: user.id,
      p_bank_code: bank.code,
      p_bank_name: bank.name,
      p_name: name,
      p_ciphertext: encryptPayoutAccountNumber(number),
      p_last4: number.replace(/\D/g, "").slice(-4),
    });
    return payReply({ status: "saved" });
  } catch (error) {
    return payError(error);
  }
}
export async function POST(request: Request) {
  if (!payoutConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const { admin, user } = await payAccess(request, "driver");
    const body = await payBody(request),
      minor = etbMinor(body.amountEtb);
    if (minor === null || minor <= 0)
      return payReply({ status: "invalid_amount" }, 400);
    const { data: account, error } = await admin
      .from("driver_payout_accounts")
      .select("id")
      .eq("driver_id", user.id)
      .eq("status", "configured")
      .single();
    if (error || !account) throw Error("BILOO_PAY_ACCOUNT_REQUIRED");
    const payout = await payRpc<PayPayout>(
      admin,
      "biloo_pay_reserve_payout_server",
      {
        p_actor: user.id,
        p_account: account.id,
        p_minor: minor,
        p_key: payKey(request),
        p_ref: "biloo-payout-" + randomUUID(),
      },
    );
    if (payout.existing) {
      const status = await reconcilePayPayout(admin, payout).catch(
        () => "verification_required",
      );
      return payReply(
        { status, requestId: payout.id },
        ["paid", "failed"].includes(status) ? 200 : 202,
      );
    }
    // One submission only. Timeouts and ambiguous rejections retain the hold for reconciliation.
    try {
      const result = await initiateChapaPayout({
        reference: payout.reference,
        amount: Number(payout.amount_minor) / 100,
        bankCode: payout.bank_code,
        accountName: payout.account_name,
        accountNumber: decryptPayoutAccountNumber(payout.account_ciphertext),
      });
      if (result.accepted) {
        await payRpc(admin, "biloo_pay_finalize_payout_server", {
          p_id: payout.id,
          p_state: "processing",
          p_evidence: {},
        });
        return payReply({ status: "processing", requestId: payout.id }, 202);
      }
    } catch {}
    return payReply(
      { status: "verification_required", requestId: payout.id },
      202,
    );
  } catch (error) {
    return payError(error);
  }
}
export async function PATCH(request: Request) {
  if (!payoutConfiguration().enabled)
    return payReply({ status: "not_configured" }, 503);
  try {
    const { admin, user } = await payAccess(request, "driver");
    const body = await payBody(request);
    if (body.requestId === undefined) {
      const snapshot = await payRpc(admin, "biloo_pay_snapshot_server", {
        p_actor: user.id,
        p_role: "driver",
      });
      let updated = 0;
      for (const pending of (
        snapshot.payouts as { id: string; status: string }[]
      )
        .filter((p) => ["requested", "processing"].includes(p.status))
        .slice(0, 3)) {
        const item = await payRpc<PayPayout>(admin, "biloo_pay_payout_server", {
          p_id: pending.id,
        });
        const status = await reconcilePayPayout(admin, item).catch(
          () => "verification_required",
        );
        if (["paid", "failed"].includes(status)) updated++;
      }
      return payReply({ status: "reconciled", updated });
    }
    if (!payUuid(body.requestId))
      return payReply({ status: "invalid_request" }, 400);
    const payout = await payRpc<PayPayout>(admin, "biloo_pay_payout_server", {
      p_id: body.requestId,
    });
    if (!payout || payout.driver_id !== user.id)
      throw Error("BILOO_PAY_FORBIDDEN");
    return payReply({
      status: await reconcilePayPayout(admin, payout),
      requestId: payout.id,
    });
  } catch (error) {
    return payError(error);
  }
}

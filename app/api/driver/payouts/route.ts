import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import {
  decryptPayoutAccountNumber,
  encryptPayoutAccountNumber,
  initiateChapaPayout,
  listChapaPayoutBanks,
  maskPayoutAccountNumber,
  normalizePayoutAccountNumber,
  payoutConfiguration,
  verifyChapaPayout,
} from "../../../../lib/nexride-payouts";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const amount = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100) / 100;
};

async function driverAccess(client: SupabaseClient, userId: string) {
  const [profileResult, driverResult] = await Promise.all([
    client
      .from("profiles")
      .select("role,account_status")
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("drivers")
      .select("review_status")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (profileResult.error || driverResult.error)
    throw new Error("DRIVER_ACCESS_UNAVAILABLE");

  const isDriver = profileResult.data?.role === "driver" && !!driverResult.data;
  return {
    isDriver,
    eligible:
      isDriver &&
      profileResult.data?.account_status === "active" &&
      driverResult.data?.review_status === "approved",
  };
}

async function availableEarnings(admin: SupabaseClient, driverId: string) {
  const { data, error } = await admin
    .from("driver_earnings_ledger")
    .select("entry_type,amount_etb,status")
    .eq("driver_id", driverId);

  if (error) throw error;

  let total = 0;
  for (const row of data || []) {
    const value = Number(row.amount_etb);
    if (!Number.isFinite(value)) continue;
    if (
      (row.entry_type === "driver_earning" ||
        row.entry_type === "adjustment") &&
      (row.status === "posted" || row.status === "paid")
    ) {
      total += value;
    } else if (
      row.entry_type === "deduction" &&
      (row.status === "posted" || row.status === "paid")
    ) {
      total -= value;
    } else if (
      row.entry_type === "payout" &&
      ["pending", "processing", "paid"].includes(row.status)
    ) {
      total -= value;
    }
  }

  return Math.max(0, Math.round(total * 100) / 100);
}

async function finalize(
  admin: SupabaseClient,
  requestId: string,
  status: "processing" | "paid" | "failed",
  providerPayload: unknown,
  failureReason?: string,
) {
  const { error } = await admin.rpc("finalize_driver_payout_server", {
    p_request_id: requestId,
    p_status: status,
    p_provider_payload:
      providerPayload && typeof providerPayload === "object"
        ? providerPayload
        : {},
    p_failure_reason: failureReason || null,
  });
  if (error) throw error;
}

export async function GET(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  try {
    const access = await driverAccess(authorized.client, authorized.user.id);
    if (!access.isDriver) return reply({ status: "forbidden" }, 403);

    const admin = serverAdminSupabase();
    const config = payoutConfiguration();
    const [accountResult, requestsResult, available] = await Promise.all([
      admin
        .from("driver_payout_accounts")
        .select(
          "id,bank_code,bank_name,account_name,account_number_last4,status,updated_at",
        )
        .eq("driver_id", authorized.user.id)
        .maybeSingle(),
      admin
        .from("driver_payout_requests")
        .select(
          "id,amount_etb,status,provider_reference,failure_reason,created_at,processed_at",
        )
        .eq("driver_id", authorized.user.id)
        .order("created_at", { ascending: false })
        .limit(20),
      availableEarnings(admin, authorized.user.id),
    ]);

    if (accountResult.error || requestsResult.error)
      return reply({ status: "setup_required" }, 503);

    const wantsBanks =
      new URL(request.url).searchParams.get("banks") === "1" &&
      config.enabled &&
      access.eligible;
    let banks: { code: string; name: string }[] = [];
    let banksUnavailable = false;
    if (wantsBanks) {
      try {
        banks = await listChapaPayoutBanks();
      } catch {
        banksUnavailable = true;
      }
    }

    const account = accountResult.data
      ? {
          id: accountResult.data.id,
          bankCode: accountResult.data.bank_code,
          bankName: accountResult.data.bank_name,
          accountName: accountResult.data.account_name,
          accountNumberMasked: accountResult.data.account_number_last4
            ? maskPayoutAccountNumber(accountResult.data.account_number_last4)
            : "Saved account",
          status: accountResult.data.status,
          updatedAt: accountResult.data.updated_at,
        }
      : null;

    return reply({
      status: "ready",
      enabled: config.enabled,
      provider: config.provider,
      eligible: access.eligible,
      availableEtb: available,
      account,
      banks,
      banksUnavailable,
      requests: (requestsResult.data || []).map((row) => ({
        id: row.id,
        amountEtb: Number(row.amount_etb),
        status: row.status,
        providerReference: row.provider_reference,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
        processedAt: row.processed_at,
      })),
    });
  } catch {
    return reply({ status: "unavailable" }, 503);
  }
}

export async function PUT(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);
  if (!payoutConfiguration().enabled)
    return reply({ status: "not_configured" }, 503);

  try {
    const access = await driverAccess(authorized.client, authorized.user.id);
    if (!access.isDriver) return reply({ status: "forbidden" }, 403);
    if (!access.eligible) return reply({ status: "driver_not_eligible" }, 409);

    const body = await request.json();
    const bankCode = text(body?.bankCode).slice(0, 40);
    const accountName = text(body?.accountName).replace(/\s+/g, " ").slice(0, 120);
    const accountNumber = normalizePayoutAccountNumber(body?.accountNumber);

    if (!bankCode || accountName.length < 2 || !accountNumber)
      return reply({ status: "invalid_account" }, 400);

    const banks = await listChapaPayoutBanks();
    const bank = banks.find((item) => item.code === bankCode);
    if (!bank) return reply({ status: "unsupported_bank" }, 400);

    const admin = serverAdminSupabase();
    const digits = accountNumber.replace(/\D/g, "");
    const { data, error } = await admin
      .from("driver_payout_accounts")
      .upsert(
        {
          driver_id: authorized.user.id,
          provider: "chapa",
          bank_code: bank.code,
          bank_name: bank.name,
          account_name: accountName,
          account_number_ciphertext:
            encryptPayoutAccountNumber(accountNumber),
          account_number_last4: digits.slice(-4),
          status: "configured",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "driver_id" },
      )
      .select(
        "id,bank_code,bank_name,account_name,account_number_last4,status,updated_at",
      )
      .single();

    if (error || !data)
      return reply({ status: "account_save_failed" }, 500);

    return reply({
      status: "saved",
      account: {
        id: data.id,
        bankCode: data.bank_code,
        bankName: data.bank_name,
        accountName: data.account_name,
        accountNumberMasked: maskPayoutAccountNumber(
          data.account_number_last4,
        ),
        status: data.status,
        updatedAt: data.updated_at,
      },
    });
  } catch {
    return reply({ status: "provider_unavailable" }, 502);
  }
}

export async function POST(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);
  if (!payoutConfiguration().enabled)
    return reply({ status: "not_configured" }, 503);

  try {
    const access = await driverAccess(authorized.client, authorized.user.id);
    if (!access.isDriver) return reply({ status: "forbidden" }, 403);
    if (!access.eligible) return reply({ status: "driver_not_eligible" }, 409);

    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() || "";
    if (idempotencyKey.length < 16 || idempotencyKey.length > 120)
      return reply({ status: "invalid_idempotency_key" }, 400);

    const body = await request.json();
    const payoutAmount = amount(body?.amountEtb);
    if (payoutAmount === null)
      return reply({ status: "invalid_amount" }, 400);

    const admin = serverAdminSupabase();
    const { data: account, error: accountError } = await admin
      .from("driver_payout_accounts")
      .select(
        "id,bank_code,account_name,account_number_ciphertext,status",
      )
      .eq("driver_id", authorized.user.id)
      .eq("status", "configured")
      .maybeSingle();

    if (accountError) return reply({ status: "setup_required" }, 503);
    if (!account) return reply({ status: "payout_account_required" }, 409);

    const providerReference =
      "nexride-payout-" + randomUUID();

    const { data: reserved, error: reserveError } = await admin.rpc(
      "reserve_driver_payout_server",
      {
        p_driver_id: authorized.user.id,
        p_payout_account_id: account.id,
        p_amount_etb: payoutAmount,
        p_idempotency_key: idempotencyKey,
        p_provider_reference: providerReference,
      },
    );

    if (reserveError) {
      const message = reserveError.message || "";
      if (message.includes("PAYOUT_INSUFFICIENT_AVAILABLE_EARNINGS"))
        return reply({ status: "insufficient_earnings" }, 409);
      if (message.includes("PAYOUT_IDEMPOTENCY_CONFLICT"))
        return reply({ status: "idempotency_conflict" }, 409);
      if (message.includes("PAYOUT_DRIVER_NOT_ELIGIBLE"))
        return reply({ status: "driver_not_eligible" }, 409);
      return reply({ status: "payout_reservation_failed" }, 500);
    }

    const reservation = (reserved || {}) as Record<string, unknown>;
    const requestId = text(reservation.requestId);
    const reference = text(reservation.providerReference);
    const currentStatus = text(reservation.status);
    const existing = reservation.existing === true;

    if (!requestId || !reference)
      return reply({ status: "payout_reservation_failed" }, 500);
    if (currentStatus === "paid" || currentStatus === "processing")
      return reply({
        status: currentStatus,
        requestId,
        providerReference: reference,
      });
    if (currentStatus === "failed" || currentStatus === "cancelled")
      return reply({ status: currentStatus, requestId }, 409);

    if (existing) {
      try {
        const verification = await verifyChapaPayout(reference);
        if (verification.state === "paid") {
          await finalize(
            admin,
            requestId,
            "paid",
            verification.providerSummary,
          );
          return reply({ status: "paid", requestId });
        }
        if (verification.state === "processing") {
          await finalize(
            admin,
            requestId,
            "processing",
            verification.providerSummary,
          );
          return reply({ status: "processing", requestId }, 202);
        }
        if (verification.state === "failed") {
          await finalize(
            admin,
            requestId,
            "failed",
            verification.providerSummary,
            "Provider rejected payout",
          );
          return reply({ status: "failed", requestId }, 409);
        }
      } catch {
        return reply(
          { status: "verification_required", requestId },
          202,
        );
      }
    }

    const accountNumber = decryptPayoutAccountNumber(
      account.account_number_ciphertext,
    );

    let initiated;
    try {
      initiated = await initiateChapaPayout({
        reference,
        amount: payoutAmount,
        bankCode: account.bank_code,
        accountName: account.account_name,
        accountNumber,
      });
    } catch {
      return reply(
        { status: "verification_required", requestId },
        202,
      );
    }

    if (initiated.accepted) {
      await finalize(
        admin,
        requestId,
        "processing",
        initiated.providerSummary,
      );
      return reply({ status: "processing", requestId }, 202);
    }

    if (initiated.definitiveFailure) {
      await finalize(
        admin,
        requestId,
        "failed",
        initiated.providerSummary,
        "Provider rejected payout",
      );
      return reply({ status: "provider_rejected", requestId }, 409);
    }

    return reply(
      { status: "verification_required", requestId },
      202,
    );
  } catch {
    return reply({ status: "payout_unavailable" }, 503);
  }
}

export async function PATCH(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);
  if (!payoutConfiguration().enabled)
    return reply({ status: "not_configured" }, 503);

  try {
    const access = await driverAccess(authorized.client, authorized.user.id);
    if (!access.isDriver) return reply({ status: "forbidden" }, 403);

    let requestedId = "";
    try {
      const body = await request.json();
      requestedId = text(body?.requestId);
    } catch {
      requestedId = "";
    }

    const admin = serverAdminSupabase();
    let query = admin
      .from("driver_payout_requests")
      .select("id,provider_reference,status")
      .eq("driver_id", authorized.user.id)
      .in("status", ["requested", "processing"])
      .order("created_at", { ascending: false })
      .limit(10);
    if (requestedId) query = query.eq("id", requestedId);

    const { data: pending, error } = await query;
    if (error) return reply({ status: "setup_required" }, 503);

    let updated = 0;
    for (const row of pending || []) {
      let verification;
      try {
        verification = await verifyChapaPayout(row.provider_reference);
      } catch {
        continue;
      }
      if (verification.state === "not_found") continue;
      const next =
        verification.state === "paid"
          ? "paid"
          : verification.state === "failed"
            ? "failed"
            : "processing";
      await finalize(
        admin,
        row.id,
        next,
        verification.providerSummary,
        next === "failed" ? "Provider rejected payout" : undefined,
      );
      updated += 1;
    }

    return reply({ status: "reconciled", updated });
  } catch {
    return reply({ status: "verification_unavailable" }, 503);
  }
}

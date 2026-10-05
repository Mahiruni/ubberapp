"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { nexrideApiHeaders } from "../../../../lib/nexride-api-auth";
import { supabase } from "../../../../lib/supabase";
import { formatEtb } from "../../../../lib/nexride-driver-earnings";
import { loadDriverProfileData } from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";

type PayoutBank = {
  code: string;
  name: string;
};

type PayoutAccount = {
  id: string;
  bankCode: string;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  status: string;
  updatedAt: string;
};

type PayoutRequest = {
  id: string;
  amountEtb: number;
  status: string;
  providerReference: string;
  failureReason: string | null;
  createdAt: string;
  processedAt: string | null;
};

type PayoutSnapshot = {
  status: string;
  enabled: boolean;
  provider: "chapa" | null;
  eligible: boolean;
  availableEtb: number;
  account: PayoutAccount | null;
  banks: PayoutBank[];
  banksUnavailable: boolean;
  requests: PayoutRequest[];
};

const money = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function DriverPayoutsPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<PayoutSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"account" | "payout" | "refresh" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accountRestricted, setAccountRestricted] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");

  async function fetchSnapshot(includeBanks = true) {
    const response = await fetch(
      "/api/driver/payouts" + (includeBanks ? "?banks=1" : ""),
      {
        cache: "no-store",
        headers: await nexrideApiHeaders(false),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.status !== "ready") {
      throw new Error(
        body?.status === "setup_required"
          ? "Payout setup is temporarily unavailable."
          : body?.status === "unavailable"
            ? "NexRide could not load payout status."
            : "Payout service is unavailable.",
      );
    }

    const next = body as PayoutSnapshot;
    setSnapshot(next);
    setBankCode((current) => current || next.account?.bankCode || "");
    return next;
  }

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const profile = await loadDriverProfileData(session.user.id);
      if (!active) return;
      if (profile.role !== "driver") {
        router.replace("/auth");
        return;
      }

      setAccountRestricted(
        profile.accountStatus !== "active" ||
          profile.reviewStatus !== "approved",
      );
      setAccountName(profile.fullName);

      try {
        await fetchSnapshot(true);
      } catch (loadError) {
        if (active)
          setError(
            loadError instanceof Error
              ? loadError.message
              : "NexRide could not load payout information.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })().catch(() => {
      if (active) {
        setError("NexRide could not load payout information.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  const totals = useMemo(() => {
    let paid = 0;
    let processing = 0;
    for (const entry of snapshot?.requests || []) {
      if (entry.status === "paid") paid += money(entry.amountEtb);
      if (entry.status === "requested" || entry.status === "processing")
        processing += money(entry.amountEtb);
    }
    return { paid, processing };
  }, [snapshot]);

  async function saveAccount() {
    if (!bankCode || accountName.trim().length < 2 || !accountNumber.trim()) {
      setError("Choose a bank and enter the account holder name and account number.");
      return;
    }

    setBusy("account");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/driver/payouts", {
        method: "PUT",
        cache: "no-store",
        headers: await nexrideApiHeaders(true),
        body: JSON.stringify({
          bankCode,
          accountName: accountName.trim(),
          accountNumber: accountNumber.trim(),
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "saved") {
        throw new Error(
          body?.status === "unsupported_bank"
            ? "That payout bank is no longer supported."
            : body?.status === "driver_not_eligible"
              ? "Complete driver verification before configuring payouts."
              : body?.status === "invalid_account"
                ? "Check the account holder name and account number."
                : "NexRide could not save this payout account.",
        );
      }
      setAccountNumber("");
      setNotice("Payout account saved securely.");
      await fetchSnapshot(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "NexRide could not save this payout account.",
      );
    } finally {
      setBusy("");
    }
  }

  async function requestPayout() {
    const value = Number(payoutAmount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid payout amount.");
      return;
    }
    if (!snapshot?.account) {
      setError("Save a payout account before requesting a withdrawal.");
      return;
    }
    if (value > snapshot.availableEtb) {
      setError("The payout amount is higher than your available earnings.");
      return;
    }

    setBusy("payout");
    setError("");
    setNotice("");
    try {
      const headers = await nexrideApiHeaders(true);
      headers["Idempotency-Key"] =
        "payout-" +
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : Date.now().toString(36) + "-" + Math.random().toString(36).slice(2));

      const response = await fetch("/api/driver/payouts", {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({ amountEtb: value }),
      });
      const body = await response.json().catch(() => null);
      if (
        !response.ok &&
        response.status !== 202
      ) {
        throw new Error(
          body?.status === "insufficient_earnings"
            ? "Your available earnings changed before the payout was reserved."
            : body?.status === "payout_account_required"
              ? "Save a payout account before requesting a withdrawal."
              : body?.status === "driver_not_eligible"
                ? "Payouts are available only to active, verified drivers."
                : body?.status === "provider_rejected"
                  ? "The payout provider rejected this withdrawal. Check your account details."
                  : "NexRide could not submit this payout request.",
        );
      }

      setPayoutAmount("");
      setNotice(
        body?.status === "paid"
          ? "Payout confirmed."
          : body?.status === "verification_required"
            ? "Payout reserved. NexRide will keep it pending until the provider can be verified."
            : "Payout submitted. Provider processing can take additional time.",
      );
      await fetchSnapshot(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "NexRide could not submit this payout request.",
      );
    } finally {
      setBusy("");
    }
  }

  async function refreshStatuses() {
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/driver/payouts", {
        method: "PATCH",
        cache: "no-store",
        headers: await nexrideApiHeaders(true),
        body: JSON.stringify({}),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== "reconciled")
        throw new Error("NexRide could not refresh provider payout status.");
      await fetchSnapshot(false);
      setNotice(
        body.updated
          ? "Payout status refreshed from the provider."
          : "No payout status changes were reported.",
      );
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "NexRide could not refresh payout status.",
      );
    } finally {
      setBusy("");
    }
  }

  const configured = snapshot?.enabled === true;
  const eligible = snapshot?.eligible === true && !accountRestricted;
  const hasPending = (snapshot?.requests || []).some((entry) =>
    entry.status === "requested" || entry.status === "processing",
  );

  return (
    <main
      className="nr-app nr-driver-profile-subpage"
      data-mode="driver"
      data-theme="dark"
    >
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button
            className="nr-driver-icon-btn"
            onClick={() => router.replace("/driver/home?screen=profile")}
            aria-label="Back to driver profile"
          >
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">DRIVER PROFILE</span>
            <h1>Payouts</h1>
            <p>Secure earnings withdrawal and provider status</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true">
            <span className="wide" />
            <span className="panel" />
          </div>
        ) : (
          <>
            {error && (
              <div className="nr-profile-alert" role="alert">
                <Icon name="info" size={17} />
                <span>{error}</span>
              </div>
            )}
            {notice && (
              <div className="nr-profile-alert success" role="status">
                <Icon name="check" size={17} />
                <span>{notice}</span>
              </div>
            )}

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Payout balance</h2>
                  <p>
                    Available earnings exclude payouts already reserved, processing,
                    or paid.
                  </p>
                </div>
                <span className="nr-driver-kicker">
                  {configured ? "CHAPA" : "OFFLINE"}
                </span>
              </div>

              <div className="nr-vehicle-detail-grid">
                <div className="nr-vehicle-detail">
                  <span>Available to withdraw</span>
                  <strong>
                    {formatEtb(snapshot?.availableEtb || 0, 2)} ETB
                  </strong>
                </div>
                <div className="nr-vehicle-detail">
                  <span>Processing</span>
                  <strong>{formatEtb(totals.processing, 2)} ETB</strong>
                </div>
                <div className="nr-vehicle-detail">
                  <span>Paid out</span>
                  <strong>{formatEtb(totals.paid, 2)} ETB</strong>
                </div>
              </div>

              {!configured ? (
                <div className="nr-profile-locked-note">
                  <Icon name="wallet" size={17} />
                  <span>
                    Driver payouts are not enabled in this environment yet.
                    Earnings remain visible and no withdrawal is simulated.
                  </span>
                </div>
              ) : !eligible ? (
                <div className="nr-profile-locked-note">
                  <Icon name="shield" size={17} />
                  <span>
                    Payout setup becomes available after your driver account and
                    documents are approved and active.
                  </span>
                </div>
              ) : snapshot?.account ? (
                <div className="nr-payout-account-summary">
                  <div>
                    <span>Saved payout account</span>
                    <strong>{snapshot.account.bankName}</strong>
                    <small>
                      {snapshot.account.accountName} ·{" "}
                      {snapshot.account.accountNumberMasked}
                    </small>
                  </div>
                  <span className="nr-doc-status approved">CONFIGURED</span>
                </div>
              ) : (
                <div className="nr-profile-locked-note">
                  <Icon name="info" size={17} />
                  <span>
                    Add a supported bank or mobile-money account before requesting
                    your first payout.
                  </span>
                </div>
              )}
            </section>

            {configured && eligible && (
              <section className="nr-profile-panel">
                <div className="nr-profile-panel-head">
                  <div>
                    <h2>
                      {snapshot?.account
                        ? "Update payout account"
                        : "Add payout account"}
                    </h2>
                    <p>
                      The full account number is encrypted server-side and is never
                      shown again after saving.
                    </p>
                  </div>
                </div>

                {snapshot?.banksUnavailable && (
                  <div className="nr-profile-alert info">
                    <Icon name="info" size={17} />
                    <span>
                      The provider bank list is temporarily unavailable. Existing
                      payout details remain unchanged.
                    </span>
                  </div>
                )}

                <div className="nr-profile-form nr-payout-form">
                  <label>
                    Bank or payout provider
                    <select
                      value={bankCode}
                      onChange={(event) => setBankCode(event.target.value)}
                      disabled={busy !== "" || snapshot?.banksUnavailable}
                    >
                      <option value="">Choose bank</option>
                      {snapshot?.account &&
                        !snapshot.banks.some(
                          (bank) => bank.code === snapshot.account?.bankCode,
                        ) && (
                          <option value={snapshot.account.bankCode}>
                            {snapshot.account.bankName}
                          </option>
                        )}
                      {snapshot?.banks.map((bank) => (
                        <option key={bank.code} value={bank.code}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Account holder name
                    <input
                      value={accountName}
                      onChange={(event) => setAccountName(event.target.value)}
                      autoComplete="name"
                      maxLength={120}
                      disabled={busy !== ""}
                    />
                  </label>
                  <label>
                    Account number
                    <input
                      value={accountNumber}
                      onChange={(event) => setAccountNumber(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={
                        snapshot?.account
                          ? "Enter again only to change the account"
                          : "Enter account number"
                      }
                      disabled={busy !== ""}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void saveAccount()}
                    disabled={
                      busy !== "" ||
                      !bankCode ||
                      !accountNumber.trim() ||
                      snapshot?.banksUnavailable
                    }
                  >
                    {busy === "account" ? "Saving securely…" : "Save payout account"}
                  </button>
                </div>
              </section>
            )}

            {configured && eligible && snapshot?.account && (
              <section className="nr-profile-panel">
                <div className="nr-profile-panel-head">
                  <div>
                    <h2>Request payout</h2>
                    <p>
                      NexRide reserves the amount first, then submits the transfer
                      to the provider using an idempotent reference.
                    </p>
                  </div>
                </div>

                <div className="nr-profile-form nr-payout-request-form">
                  <label>
                    Amount in ETB
                    <input
                      value={payoutAmount}
                      onChange={(event) => setPayoutAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0.00"
                      disabled={busy !== ""}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void requestPayout()}
                    disabled={
                      busy !== "" ||
                      !payoutAmount ||
                      (snapshot?.availableEtb || 0) <= 0
                    }
                  >
                    {busy === "payout" ? "Submitting…" : "Request payout"}
                  </button>
                </div>

                <div className="nr-profile-locked-note">
                  <Icon name="info" size={17} />
                  <span>
                    A submitted transfer can remain processing while the payment
                    provider or bank completes its approval and settlement steps.
                  </span>
                </div>
              </section>
            )}

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Recent payouts</h2>
                  <p>Only actual payout requests and verified provider states appear here.</p>
                </div>
                {configured && hasPending && (
                  <button
                    type="button"
                    className="nr-payout-refresh"
                    disabled={busy !== ""}
                    onClick={() => void refreshStatuses()}
                  >
                    <Icon name="arrow" size={15} />
                    {busy === "refresh" ? "Refreshing…" : "Refresh status"}
                  </button>
                )}
              </div>

              <div className="nr-payout-status-list">
                {snapshot?.requests.length ? (
                  snapshot.requests.map((entry) => (
                    <div className="nr-payout-status-row" key={entry.id}>
                      <div>
                        <span>
                          {entry.status === "paid"
                            ? "Paid payout"
                            : entry.status === "failed"
                              ? "Failed payout"
                              : "Payout request"}
                        </span>
                        <small>
                          {new Date(entry.createdAt).toLocaleDateString("en-ET")}
                          {entry.failureReason ? " · " + entry.failureReason : ""}
                        </small>
                      </div>
                      <div>
                        <strong>
                          {formatEtb(money(entry.amountEtb), 2)} ETB
                        </strong>
                        <small>{entry.status}</small>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="nr-report-ledger-empty">
                    No payout requests have been recorded yet.
                  </div>
                )}
              </div>

              <div className="nr-doc-actions">
                <button
                  className="nr-doc-secondary"
                  onClick={() => router.push("/driver/earnings/report")}
                >
                  <Icon name="money" size={16} />
                  View detailed earnings report
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

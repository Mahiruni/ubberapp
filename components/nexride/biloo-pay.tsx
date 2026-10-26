"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./ui";
import { RiderMenu } from "./rider-menu";
import { supabase } from "../../lib/supabase";
import { useAppearance } from "../../lib/nexride-appearance";
import { registerNexRideBackHandler } from "../../lib/nexride-native-navigation";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import {
  etbDecimal,
  etbMinor,
  formatPayMoney,
} from "../../lib/biloo-pay-money";
import "../../app/biloo-pay.css";

type Role = "rider" | "driver" | "admin";
type Ride = {
  id: string;
  pickup_location: string;
  destination_location: string;
  final_fare_etb: number | string | null;
  payment_method: string;
  payment_status: string;
  completed_at: string;
  terms_ready: boolean;
  settled: boolean;
};
type Settlement = {
  ride_id: string;
  gross_minor: number;
  driver_minor: number;
  commission_minor: number;
  commission_offset_minor: number;
  method: string;
  confirmed_at: string;
  provider_reference: string | null;
};
type Payout = {
  id: string;
  amount_minor: number;
  status: string;
  reference: string;
  created_at: string;
};
type FinanceCase = {
  id: string;
  ride_id: string;
  kind: string;
  reason: string;
  status: string;
  created_at: string;
};
type Snapshot = {
  mode: "live" | "test";
  balance: {
    availableMinor: number;
    digitalPayableMinor: number;
    commissionDueMinor: number;
    withdrawalPendingMinor: number;
  } | null;
  totals: {
    grossMinor: number;
    driverMinor: number;
    commissionMinor: number;
    cashCollectedMinor: number;
  } | null;
  rides: Ride[];
  settlements: Settlement[];
  payouts: Payout[];
  cases: FinanceCase[];
  attempts?: {
    id: string;
    tx_ref: string;
    status: string;
    amount_minor: number;
    mode: string;
  }[];
  webhooks?: {
    digest: string;
    event: string;
    state: string;
    received_at: string;
  }[];
  audit?: { id: string; action: string; created_at: string }[];
};
type Modal =
  | { kind: "cash"; ride: Ride }
  | { kind: "withdraw" }
  | { kind: "case"; ride: Ride }
  | { kind: "review"; item: FinanceCase };
const date = (value: string | null) =>
  !value || !Number.isFinite(Date.parse(value))
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-ET", {
        month: "short",
        day: "numeric",
        timeZone: "Africa/Addis_Ababa",
      }).format(new Date(value));
const labels: Record<string, string> = {
  requested: "Requested",
  processing: "Processing",
  paid: "Verified paid",
  failed: "Verified failed",
  open: "Open",
  under_review: "Under review",
  closed: "Closed",
  pending: "Pending",
  initialized: "Verification needed",
  retry: "Retry needed",
  processed: "Processed",
  rejected: "Review needed",
  ignored: "Ignored",
  received: "Received",
  review: "Review needed",
};
const friendlyError = (status: string) =>
  ({
    forbidden: "You do not have access to this payment record.",
    terms_review_required:
      "This trip needs a finance review before payment can be recorded.",
    insufficient_funds:
      "Your available funds changed. Refresh and try a smaller amount.",
    finance_hold:
      "A payment review is open. Please contact Biloo support before withdrawing.",
    verification_required:
      "Confirmation is still pending. Please refresh before trying again.",
  })[status] ||
  "We couldn’t confirm this request. Refresh to check its status before trying again.";

export function BilooPay({ role }: { role: Role }) {
  const router = useRouter();
  const appearance = useAppearance(role === "driver" ? "driver" : "rider");
  const theme = appearance.resolvedTheme;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false),
    [withdrawals, setWithdrawals] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [tab, setTab] = useState(
    role === "admin" ? "Transactions" : "Overview",
  );
  const [busy, setBusy] = useState(false),
    [modal, setModal] = useState<Modal | null>(null);
  const [checked, setChecked] = useState(false),
    [amount, setAmount] = useState("");
  const [reason, setReason] = useState(""),
    [caseKind, setCaseKind] = useState("dispute");
  const [reviewState, setReviewState] = useState("under_review");
  const requestKey = useRef(""),
    seq = useRef(0),
    actionLock = useRef(false),
    actorId = useRef("");
  const home =
    role === "driver" ? "/driver/earnings" : role === "admin" ? "/admin" : "/";

  const load = useCallback(async () => {
    const generation = ++seq.current;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace(
          role === "driver"
            ? "/driver/auth"
            : role === "admin"
              ? "/admin"
              : "/rider/sign-in",
        );
        return;
      }
      actorId.current = data.session.user.id;
      const [response, config] = await Promise.all([
        nexrideApiFetch(
          role === "admin" ? "/api/admin/finance" : "/api/biloo-pay/snapshot",
          { cache: "no-store" },
        ),
        fetch("/api/payments/config", { cache: "no-store" })
          .then((r) => r.json())
          .catch(() => null),
      ]);
      const body = await response.json().catch(() => null);
      if (generation !== seq.current) return;
      setOnline(config?.enabled === true);
      if (!response.ok || body?.status !== "ready") {
        setSnapshot(null);
        setError("Financial records are unavailable. Refresh to check again.");
        return;
      }
      setSnapshot(body as Snapshot);
      setError("");
      if (role === "driver") {
        const result = await nexrideApiFetch("/api/driver/payouts", {
          cache: "no-store",
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (generation !== seq.current) return;
        setWithdrawals(result?.enabled === true && result?.eligible === true);
        setAccount(result?.account?.accountNumberMasked || null);
      }
    } catch {
      if (generation === seq.current) {
        setSnapshot(null);
        setError("Financial records are unavailable. Refresh to check again.");
      }
    } finally {
      if (generation === seq.current) setLoading(false);
    }
  }, [role, router]);
  useEffect(() => {
    if (
      role === "driver" &&
      new URL(window.location.href).searchParams.has("cash")
    )
      setTab("Cash");
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      ++seq.current;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  function open(next: Modal) {
    setReviewState("under_review");
    requestKey.current = crypto.randomUUID();
    setChecked(false);
    setAmount("");
    setReason("");
    setNotice("");
    setModal(next);
    if (next.kind === "cash") {
      // Survives a lost response/reload without creating another financial operation.
      try {
        const storageKey = "biloo.pay.cash." + next.ride.id;
        const saved = localStorage.getItem(storageKey);
        if (saved) requestKey.current = saved;
        else localStorage.setItem(storageKey, requestKey.current);
      } catch {}
    }
  }
  async function action(path: string, body: unknown, key = requestKey.current) {
    if (actionLock.current) return null;
    actionLock.current = true;
    setBusy(true);
    setNotice("");
    try {
      const response = await nexrideApiFetch(path, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw Error(friendlyError(result?.status || ""));
      return result as Record<string, unknown>;
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Request could not be confirmed.",
      );
      return null;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function submitModal() {
    if (!modal || actionLock.current) return;
    let result: Record<string, unknown> | null = null;
    if (modal.kind === "cash" && checked)
      result = await action("/api/biloo-pay/cash", {
        rideRequestId: modal.ride.id,
        cashReceived: true,
      });
    if (modal.kind === "withdraw") {
      const minor = etbMinor(amount);
      if (
        minor === null ||
        minor <= 0 ||
        minor > (snapshot?.balance?.availableMinor ?? -1)
      )
        return;
      const storageKey =
        "biloo.pay.withdrawal." + actorId.current + "." + minor;
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) requestKey.current = saved;
        else localStorage.setItem(storageKey, requestKey.current);
      } catch {}
      result = await action("/api/driver/payouts", {
        amountEtb: etbDecimal(minor),
      });
      if (result?.requestId) {
        try {
          localStorage.removeItem(storageKey);
        } catch {}
      }
    }
    if (modal.kind === "case" && reason.trim().length >= 10)
      result = await action("/api/biloo-pay/cases", {
        rideId: modal.ride.id,
        kind: caseKind,
        reason,
      });
    if (modal.kind === "review" && reason.trim().length >= 10)
      result = await action("/api/admin/finance", {
        action: "review_case",
        id: modal.item.id,
        state: reviewState,
        note: reason,
      });
    if (!result) return;
    setNotice(
      result.status === "recorded"
        ? "Cash receipt recorded. Your driver earnings and commission are shown separately."
        : result.status === "paid"
          ? "The provider has verified this payment."
          : result.status === "submitted"
            ? "Your request has been received for review."
            : result.status === "under_review" || result.status === "closed"
              ? "Case review updated."
              : "Confirmation is pending. Your withdrawal remains reserved until verified.",
    );
    setModal(null);
    await load();
  }
  async function pay(ride: Ride) {
    let key = "";
    try {
      key =
        localStorage.getItem("biloo.pay.checkout." + ride.id) ||
        crypto.randomUUID();
      localStorage.setItem("biloo.pay.checkout." + ride.id, key);
    } catch {
      key = crypto.randomUUID();
    }
    const result = await action(
      "/api/payments/chapa/initialize",
      { rideRequestId: ride.id },
      key,
    );
    if (result?.status === "ready" && typeof result.checkoutUrl === "string") {
      const url = new URL(result.checkoutUrl);
      if (
        url.protocol === "https:" &&
        url.hostname === "checkout.chapa.co" &&
        !url.username &&
        !url.password &&
        !url.port
      ) {
        window.location.assign(url.href);
        return;
      }
    }
    if (result)
      setNotice(
        result.status === "already_paid"
          ? "Refresh to see your payment record."
          : "Your payment is awaiting confirmation. Please refresh before trying again.",
      );
    await load();
  }
  async function reconcile(kind: "payment" | "payout", id: string) {
    const result = await action(
      "/api/admin/finance",
      kind === "payment"
        ? { action: "reconcile_payment", txRef: id }
        : { action: "reconcile_payout", id },
      crypto.randomUUID(),
    );
    if (result)
      setNotice(
        result.status === "paid"
          ? "Provider verification confirmed payment."
          : "Verification is still pending. No manual completion was recorded.",
      );
    await load();
  }
  const pending = snapshot?.rides.filter((r) => !r.settled) || [];
  const cashRides = pending.filter((r) => r.payment_method === "cash");
  const tabs =
    role === "admin"
      ? ["Transactions", "Payouts", "Reconciliation", "Requests"]
      : role === "driver"
        ? ["Overview", "Cash", "Activity"]
        : ["Overview", "Activity", "Help"];
  const balance = snapshot?.balance;

  return (
    <main className="biloo-pay-screen" data-theme={theme} data-pay-role={role}>
      <div className="bp-wrap">
        {role !== "driver" && (
          <header className="bp-header">
            {role === "rider" ? (
              <RiderMenu active="wallet" className="bp-menu-trigger" />
            ) : (
              <Link href={home} className="bp-icon-button" aria-label="Back">
                <Icon name="back" />
              </Link>
            )}
            <div className="bp-brand">
              <img src="/brand/biloo-mark.svg" width={25} height={25} alt="" />
              <span>
                BILOO <b>PAY</b>
              </span>
            </div>
            <ThemeButton
              theme={theme}
              onClick={() =>
                appearance.setPreference(theme === "light" ? "dark" : "light")
              }
            />
          </header>
        )}
        <div className="bp-heading">
          <div>
            <span className="bp-eyebrow">
              {role === "admin"
                ? "FINANCE OPERATIONS"
                : role === "driver"
                  ? "YOUR MONEY, CLEARLY"
                  : "EVERY RIDE, TAKEN CARE OF"}
            </span>
            <h1>
              {role === "driver"
                ? "Driver Wallet"
                : role === "admin"
                  ? "Finance overview"
                  : "Your payments"}
            </h1>
          </div>
          <div className="bp-heading-actions">
            {role === "driver" && (
              <ThemeButton
                theme={theme}
                onClick={() =>
                  appearance.setPreference(theme === "light" ? "dark" : "light")
                }
              />
            )}
            <button
              className="bp-icon-button"
              onClick={() => void load()}
              aria-label="Refresh payment records"
              disabled={busy || loading}
            >
              <Icon name="refresh" size={18} />
            </button>
          </div>
        </div>
        <section
          className="bp-hero"
          aria-label={
            role === "driver" ? "Available to withdraw" : "Biloo Pay overview"
          }
        >
          <div className="bp-hero-top">
            <span>
              <Icon name="shield" size={15} /> BILOO PAY
            </span>
            <span>ETB</span>
          </div>
          {role === "driver" ? (
            <>
              <p>Available to withdraw</p>
              <strong className="bp-balance" data-testid="available-balance">
                {formatPayMoney(balance?.availableMinor)} <small>ETB</small>
              </strong>
              <span className="bp-hero-hint">
                Verified digital earnings, after cash commission and holds.
              </span>
              <div className="bp-hero-actions">
                <button
                  onClick={() => open({ kind: "withdraw" })}
                  disabled={
                    !withdrawals ||
                    !balance ||
                    balance.availableMinor <= 0 ||
                    busy
                  }
                >
                  <Icon name="arrow" size={17} /> Withdraw
                </button>
                <Link href="/driver/profile/payouts">
                  {account || "Payout account"}
                  <Icon name="chevron" size={14} />
                </Link>
              </div>
            </>
          ) : role === "admin" ? (
            <>
              <p>Recorded collections</p>
              <strong className="bp-balance">
                {formatPayMoney(snapshot?.totals?.grossMinor)}{" "}
                <small>ETB</small>
              </strong>
              <span className="bp-hero-hint">
                Settlements recorded in Biloo Pay. Provider clearing is
                reconciled separately.
              </span>
            </>
          ) : (
            <>
              <h2>
                One place.
                <br />
                Every payment.
              </h2>
              <p className="bp-hero-description">
                Clear records. Secure checkout.
                <br />A little more peace of mind.
              </p>
              <span className="bp-hero-footer">
                <Icon name="lock" size={13} /> Confirmation you can check.
              </span>
            </>
          )}
        </section>
        {role !== "rider" && (
          <div className="bp-metrics">
            <Metric
              icon="money"
              label="Cash collected"
              value={snapshot?.totals?.cashCollectedMinor}
              detail="Held by the driver"
            />
            <Metric
              icon="chart"
              label={
                role === "driver" ? "Net trip earnings" : "Commission recorded"
              }
              value={
                role === "driver"
                  ? snapshot?.totals?.driverMinor
                  : snapshot?.totals?.commissionMinor
              }
              detail="Biloo Pay settlements"
            />
            {role === "driver" && (
              <>
                <Metric
                  icon="clock"
                  label="Withdrawal pending"
                  value={balance?.withdrawalPendingMinor}
                  detail="Reserved, awaiting provider"
                />
                <Metric
                  icon="list"
                  label="Cash commission due"
                  value={balance?.commissionDueMinor}
                  detail="Owed to Biloo"
                />
              </>
            )}
          </div>
        )}
        {snapshot?.mode === "test" && (
          <div className="bp-notice" role="status">
            <Icon name="info" size={18} />
            <p>
              Test environment · no real money. These records are for payment
              testing.
            </p>
          </div>
        )}
        {notice && (
          <div className="bp-notice" role="status">
            <Icon name="info" size={18} />
            <p>{notice}</p>
          </div>
        )}
        <nav className="bp-tabs" aria-label="Payment sections">
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
            >
              {item}
              {item === "Cash" && cashRides.length > 0 && (
                <span>{cashRides.length}</span>
              )}
            </button>
          ))}
        </nav>
        {loading ? (
          <div className="bp-empty" role="status" aria-busy="true">
            <Icon name="clock" />
            <h2>Loading payment records</h2>
            <p>Checking your latest information.</p>
          </div>
        ) : error ? (
          <div className="bp-empty" role="alert">
            <Icon name="info" />
            <h2>Unable to load records</h2>
            <p>{error}</p>
            <button className="bp-primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : (
          <>
            {role === "rider" && tab === "Overview" && (
              <section className="bp-card">
                <SectionTitle
                  title="Ways to pay"
                  detail="Simple choices for your ride."
                />
                <div className="bp-method">
                  <span className="bp-symbol">
                    <Icon name="money" />
                  </span>
                  <div>
                    <strong>Cash</strong>
                    <small>Pay your driver after the ride.</small>
                  </div>
                  <Badge>Available</Badge>
                </div>
                <div className="bp-method">
                  <span className="bp-symbol">
                    <Icon name="card" />
                  </span>
                  <div>
                    <strong>Chapa checkout</strong>
                    <small>
                      {online
                        ? "Pay eligible completed rides securely."
                        : "Online payments are not available yet."}
                    </small>
                  </div>
                  <Badge>{online ? "Available" : "Unavailable"}</Badge>
                </div>
                <p className="bp-footnote">
                  <Icon name="shield" size={14} /> Digital payments are
                  confirmed with the payment provider.
                </p>
              </section>
            )}
            {((role === "rider" && tab === "Overview") ||
              (role === "driver" && ["Overview", "Cash"].includes(tab))) && (
              <section className="bp-card">
                <SectionTitle
                  title={
                    role === "driver"
                      ? "Cash to confirm"
                      : "Needs your attention"
                  }
                  detail={
                    role === "driver"
                      ? "Confirm only after receiving the full fare."
                      : "Check a fare or complete an eligible payment."
                  }
                />
                {(role === "driver" ? cashRides : pending).length ? (
                  (role === "driver" ? cashRides : pending).map((ride) => (
                    <div className="bp-ride" key={ride.id}>
                      <div className="bp-ride-main">
                        <span className="bp-symbol">
                          <Icon
                            name={
                              ride.payment_method === "cash" ? "money" : "card"
                            }
                            size={19}
                          />
                        </span>
                        <div>
                          <strong>
                            {ride.destination_location || "Completed ride"}
                          </strong>
                          <small>
                            From {ride.pickup_location || "pickup"} ·{" "}
                            {date(ride.completed_at)}
                          </small>
                        </div>
                        <b>
                          {formatPayMoney(etbMinor(ride.final_fare_etb))}
                          <small>ETB</small>
                        </b>
                      </div>
                      <div className="bp-row-actions">
                        <span className="bp-status">
                          {!ride.terms_ready
                            ? "Finance review needed"
                            : ride.payment_method === "cash"
                              ? "Awaiting cash confirmation"
                              : "Payment pending"}
                        </span>
                        {role === "driver" ? (
                          <button
                            disabled={busy || !ride.terms_ready}
                            onClick={() => open({ kind: "cash", ride })}
                          >
                            Confirm cash
                          </button>
                        ) : ride.payment_method === "chapa" ? (
                          <button
                            disabled={busy || !online || !ride.terms_ready}
                            onClick={() => void pay(ride)}
                          >
                            Pay securely
                          </button>
                        ) : (
                          <Link href={"/rider/trips/receipt?ride=" + ride.id}>
                            View trip
                          </Link>
                        )}
                        <button
                          className="bp-quiet"
                          onClick={() => open({ kind: "case", ride })}
                        >
                          Get help
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty
                    title={
                      role === "driver"
                        ? "Cash confirmations are up to date"
                        : "Nothing needs your attention"
                    }
                    detail="Your recorded payments appear in Activity."
                  />
                )}
              </section>
            )}
            {((role !== "admin" && tab === "Activity") ||
              (role === "admin" && tab === "Transactions")) && (
              <section className="bp-card">
                <SectionTitle
                  title="Payment activity"
                  detail="Recorded receipts, with a clear payment method."
                />
                {snapshot?.settlements.length ? (
                  snapshot.settlements.map((s) => (
                    <div className="bp-transaction" key={s.ride_id}>
                      <span className="bp-symbol">
                        <Icon
                          name={s.method === "cash" ? "money" : "card"}
                          size={18}
                        />
                      </span>
                      <div>
                        <strong>
                          {s.method === "cash"
                            ? "Cash received by driver"
                            : "Chapa payment verified"}
                        </strong>
                        <small>
                          {date(s.confirmed_at)} ·{" "}
                          {s.ride_id.slice(0, 8).toUpperCase()}
                        </small>
                        <span className="bp-status" data-state="paid">
                          {s.method === "cash"
                            ? "Driver confirmed"
                            : "Provider verified"}
                        </span>
                        {role !== "rider" && s.commission_offset_minor > 0 && (
                          <small>
                            Cash commission offset:{" "}
                            {formatPayMoney(s.commission_offset_minor)} ETB
                          </small>
                        )}
                      </div>
                      <b>
                        {formatPayMoney(s.gross_minor)}
                        <small>ETB</small>
                      </b>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No Biloo Pay receipts yet"
                    detail="Receipts appear after cash confirmation or provider verification."
                  />
                )}
              </section>
            )}
            {role === "driver" && ["Activity", "Overview"].includes(tab) && (
              <section className="bp-card">
                <SectionTitle
                  title="Withdrawals"
                  detail="A request stays pending until the provider confirms it."
                />
                {snapshot?.payouts.length ? (
                  snapshot.payouts.map((p) => (
                    <div className="bp-transaction" key={p.id}>
                      <span className="bp-symbol">
                        <Icon name="arrow" size={18} />
                      </span>
                      <div>
                        <strong>Withdrawal</strong>
                        <small>{date(p.created_at)}</small>
                        <Badge state={p.status}>
                          {labels[p.status] || p.status}
                        </Badge>
                      </div>
                      <b>
                        {formatPayMoney(p.amount_minor)}
                        <small>ETB</small>
                      </b>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No withdrawal requests"
                    detail="Eligible digital earnings can be withdrawn to your payout account."
                  />
                )}
              </section>
            )}
            {role === "rider" && tab === "Help" && (
              <section className="bp-card">
                <SectionTitle
                  title="Payment support"
                  detail="Choose a trip to request a refund or report a payment issue."
                />
                {snapshot?.rides.length ? (
                  snapshot.rides.map((ride) => (
                    <button
                      className="bp-support-row"
                      key={ride.id}
                      onClick={() => open({ kind: "case", ride })}
                    >
                      <Icon name="chat" size={18} />
                      <span>
                        {ride.destination_location}
                        <small>{date(ride.completed_at)}</small>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No completed trips"
                    detail="Payment support will be available here after your first completed trip."
                  />
                )}
              </section>
            )}
            {role === "rider" &&
              tab === "Help" &&
              (snapshot?.cases.length || 0) > 0 && (
                <section className="bp-card">
                  <SectionTitle
                    title="Your payment requests"
                    detail="Track your requests and their review status."
                  />
                  {snapshot?.cases.map((c) => (
                    <div className="bp-transaction" key={c.id}>
                      <div>
                        <strong>
                          {c.kind === "refund"
                            ? "Refund request"
                            : "Payment review"}
                        </strong>
                        <small>{date(c.created_at)}</small>
                      </div>
                      <Badge state={c.status}>
                        {labels[c.status] || c.status}
                      </Badge>
                    </div>
                  ))}
                </section>
              )}
            {role === "admin" && tab === "Payouts" && (
              <section className="bp-card">
                <SectionTitle
                  title="Payout requests"
                  detail="Verify with Chapa before recording an outcome."
                />
                {snapshot?.payouts.length ? (
                  snapshot.payouts.map((p) => (
                    <div className="bp-ride" key={p.id}>
                      <div className="bp-transaction">
                        <div>
                          <strong>{p.reference}</strong>
                          <Badge state={p.status}>
                            {labels[p.status] || p.status}
                          </Badge>
                        </div>
                        <b>{formatPayMoney(p.amount_minor)} ETB</b>
                      </div>
                      {!["paid", "failed"].includes(p.status) && (
                        <button
                          className="bp-secondary"
                          disabled={busy}
                          onClick={() => void reconcile("payout", p.id)}
                        >
                          Verify with provider
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No payouts recorded"
                    detail="Withdrawal requests appear here once reserved."
                  />
                )}
              </section>
            )}
            {role === "admin" && tab === "Reconciliation" && (
              <>
                <section className="bp-card">
                  <SectionTitle
                    title="Checkout verification"
                    detail="Unresolved checkouts remain pending."
                  />
                  {snapshot?.attempts?.length ? (
                    snapshot.attempts.map((a) => (
                      <div className="bp-ride" key={a.id}>
                        <strong className="bp-reference">{a.tx_ref}</strong>
                        <div className="bp-row-actions">
                          <Badge state={a.status}>
                            {labels[a.status] || a.status}
                          </Badge>
                          <span>
                            {formatPayMoney(a.amount_minor)} ETB · {a.mode}
                          </span>
                          {a.status !== "paid" && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                void reconcile("payment", a.tx_ref)
                              }
                            >
                              Verify payment
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="No checkout attempts"
                      detail="Provider payment attempts will appear here."
                    />
                  )}
                </section>
                <section className="bp-card">
                  <SectionTitle
                    title="Webhook inbox"
                    detail="Signed provider notifications and retry status."
                  />
                  {snapshot?.webhooks?.length ? (
                    snapshot.webhooks.map((w) => (
                      <div className="bp-transaction" key={w.digest}>
                        <div>
                          <strong>{w.event}</strong>
                          <small>{date(w.received_at)}</small>
                        </div>
                        <Badge state={w.state}>
                          {labels[w.state] || w.state}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="No notifications received"
                      detail="Authenticated provider events are recorded here."
                    />
                  )}
                </section>
              </>
            )}
            {role === "admin" && tab === "Requests" && (
              <section className="bp-card">
                <SectionTitle
                  title="Refunds, disputes & reviews"
                  detail="Case status tracks the review. It does not confirm a refund."
                />
                {snapshot?.cases.length ? (
                  snapshot.cases.map((c) => (
                    <div className="bp-ride" key={c.id}>
                      <div className="bp-row-actions">
                        <strong>{c.kind}</strong>
                        <Badge state={c.status}>
                          {labels[c.status] || c.status}
                        </Badge>
                      </div>
                      <p>{c.reason}</p>
                      <small>
                        {date(c.created_at)} · {c.ride_id.slice(0, 8)}
                      </small>
                      <button
                        className="bp-secondary"
                        disabled={busy}
                        onClick={() => open({ kind: "review", item: c })}
                      >
                        Review case
                      </button>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No open requests"
                    detail="Refund requests and payment disputes are tracked here."
                  />
                )}
              </section>
            )}
            {role === "admin" && (
              <section className="bp-card">
                <SectionTitle
                  title="Recent finance audit"
                  detail="Recorded financial actions."
                />
                {snapshot?.audit?.length ? (
                  snapshot.audit.slice(0, 8).map((a) => (
                    <div className="bp-transaction" key={a.id}>
                      <strong>{a.action.replaceAll("_", " ")}</strong>
                      <small>{date(a.created_at)}</small>
                    </div>
                  ))
                ) : (
                  <Empty
                    title="No finance events yet"
                    detail="Actions will appear after they have been recorded."
                  />
                )}
              </section>
            )}
          </>
        )}
        <footer className="bp-footer">
          <Icon name="lock" size={13} />
          <span>Biloo Pay · Ethiopian Birr</span>
          <span>By Hisab Technologies PLC</span>
        </footer>
      </div>
      {modal && (
        <PayDialog
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <span className="bp-eyebrow">BILOO PAY</span>
          <h2>
            {modal.kind === "cash"
              ? "Cash received?"
              : modal.kind === "withdraw"
                ? "Withdraw your earnings"
                : modal.kind === "review"
                  ? "Review payment case"
                  : "How can we help?"}
          </h2>
          {modal.kind === "cash" && (
            <>
              <p>Confirm only after receiving the full fare from your rider.</p>
              <strong className="bp-dialog-amount">
                {formatPayMoney(etbMinor(modal.ride.final_fare_etb))}{" "}
                <small>ETB</small>
              </strong>
              <p>
                Cash stays with you. Biloo commission is recorded separately and
                may be offset against your digital earnings.
              </p>
              <label className="bp-check">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setChecked(e.target.checked)}
                  disabled={busy}
                />{" "}
                I received the full cash fare.
              </label>
            </>
          )}
          {modal.kind === "withdraw" && (
            <>
              <p>Available: {formatPayMoney(balance?.availableMinor)} ETB</p>
              <label>
                Amount in ETB
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  maxLength={13}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p>
                To {account || "your saved account"}. Provider confirmation is
                required.
              </p>
            </>
          )}
          {modal.kind === "case" && (
            <>
              <label>
                Request type
                <select
                  value={caseKind}
                  onChange={(e) => setCaseKind(e.target.value)}
                  disabled={busy}
                >
                  <option value="dispute">Payment issue</option>
                  <option value="refund">Refund request</option>
                  <option value="reconciliation">Check payment records</option>
                </select>
              </label>
              <label>
                Tell us what happened
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <p>Refunds are reviewed before any money is returned.</p>
            </>
          )}
          {modal.kind === "review" && (
            <>
              <label>
                Review status
                <select
                  value={reviewState}
                  onChange={(e) => setReviewState(e.target.value)}
                  disabled={busy}
                >
                  <option value="under_review">Under review</option>
                  <option
                    value="closed"
                    disabled={
                      modal.kind === "review" && modal.item.kind !== "dispute"
                    }
                  >
                    Closed
                  </option>
                </select>
              </label>
              <label>
                Review notes
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  disabled={busy}
                />
              </label>
              <p>Closing a case does not send or record a refund.</p>
            </>
          )}
          {notice && <p role="alert">{notice}</p>}
          <div className="bp-dialog-actions">
            <button
              className="bp-secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="bp-primary"
              disabled={
                busy ||
                (modal.kind === "cash" && !checked) ||
                (modal.kind === "withdraw" &&
                  (etbMinor(amount) === null ||
                    (etbMinor(amount) || 0) <= 0 ||
                    (etbMinor(amount) || 0) >
                      (balance?.availableMinor ?? -1))) ||
                (["case", "review"].includes(modal.kind) &&
                  reason.trim().length < 10)
              }
              onClick={() => void submitModal()}
            >
              {busy
                ? "Checking…"
                : modal.kind === "cash"
                  ? "Confirm cash received"
                  : modal.kind === "withdraw"
                    ? "Request withdrawal"
                    : modal.kind === "review"
                      ? "Save review"
                      : "Submit request"}
            </button>
          </div>
        </PayDialog>
      )}
    </main>
  );
}
function ThemeButton({
  theme,
  onClick,
}: {
  theme: "light" | "dark";
  onClick: () => void;
}) {
  return (
    <button
      className="bp-icon-button"
      aria-label={
        theme === "light" ? "Switch to dark theme" : "Switch to light theme"
      }
      onClick={onClick}
    >
      <Icon name={theme === "light" ? "moon" : "sun"} size={19} />
    </button>
  );
}
function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: IconName;
  label: string;
  value?: number;
  detail: string;
}) {
  return (
    <section className="bp-metric">
      <span>
        <Icon name={icon} size={16} />
        {label}
      </span>
      <strong>
        {formatPayMoney(value)} <small>ETB</small>
      </strong>
      <small>{detail}</small>
    </section>
  );
}
function Badge({ children, state }: { children: ReactNode; state?: string }) {
  return (
    <span className="bp-badge" data-state={state}>
      {children}
    </span>
  );
}
function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="bp-section-title">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="bp-empty">
      <span className="bp-empty-icon">
        <Icon name="list" size={20} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function PayDialog({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      registerNexRideBackHandler(() => {
        close.current();
        return true;
      }, 120),
    [],
  );
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      className="bp-dialog"
      ref={ref}
      aria-label="Biloo Pay confirmation"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

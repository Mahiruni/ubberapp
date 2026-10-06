"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import "./admin.css";

type Module =
  | "overview"
  | "rides"
  | "drivers"
  | "users"
  | "finance"
  | "safety"
  | "support"
  | "audit";

type Row = Record<string, any>;

const nav: [Module, string, string][] = [
  ["overview", "Overview", "⌂"],
  ["rides", "Live rides", "↗"],
  ["drivers", "Drivers", "◆"],
  ["users", "Users", "●"],
  ["finance", "Finance", "₿"],
  ["safety", "Safety", "!"],
  ["support", "Support", "?"],
  ["audit", "Audit log", "◷"],
];

export default function AdminPage() {
  const [module, setModule] = useState<Module>("overview");
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<Row>({});
  const [range, setRange] = useState<"today" | "7d" | "30d">("today");
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const toast = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const checkAdmin = async (userId: string) => {
    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("id,full_name,phone,role,admin_role,account_status")
      .eq("id", userId)
      .maybeSingle();

    if (
      profileError ||
      !data ||
      data.role !== "admin" ||
      data.account_status !== "active"
    ) {
      setAdmin(null);
      setLoading(false);
      return;
    }

    setAdmin(data);
    setLoading(false);
  };

  useEffect(() => {
    const failSafe = window.setTimeout(() => setLoading(false), 3500);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session) void checkAdmin(data.session.user.id);
        else setLoading(false);
      })
      .catch(() => setLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void checkAdmin(nextSession.user.id);
      else {
        setAdmin(null);
        setLoading(false);
      }
    });

    return () => {
      window.clearTimeout(failSafe);
      subscription.unsubscribe();
    };
  }, []);

  const loadMetrics = async () => {
    if (!admin) return;
    const start =
      range === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0))
        : new Date(Date.now() - (range === "7d" ? 7 : 30) * 86400000);

    const { data, error: metricError } = await supabase.rpc(
      "admin_dashboard_summary",
      {
        p_from: start.toISOString(),
        p_to: new Date().toISOString(),
      },
    );

    if (metricError) {
      setError("Live admin metrics could not be loaded.");
      return;
    }

    setMetrics(data || {});
  };

  const loadRows = async () => {
    if (!admin || module === "overview") return;

    setRefreshing(true);
    setError("");
    let data: Row[] = [];

    try {
      if (module === "rides") {
        const result = await supabase
          .from("ride_requests")
          .select(
            "id,rider_id,assigned_driver_id,ride_category,status,pickup_location,destination_location,estimated_trip_fare_etb,final_fare_etb,payment_method,payment_status,created_at,accepted_at,pickup_arrived_at,started_at,completed_at,cancelled_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      } else if (module === "drivers") {
        const result = await supabase
          .from("drivers")
          .select(
            "id,city_id,license_number,license_expiry,vehicle,vehicle_plate,license_document_path,vehicle_registration_path,is_online,rating,review_status,rejection_reason,submitted_at,reviewed_at,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      } else if (module === "users") {
        const result = await supabase
          .from("profiles")
          .select(
            "id,full_name,phone,role,admin_role,account_status,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      } else if (module === "finance") {
        const [payments, payouts] = await Promise.all([
          supabase
            .from("payment_transactions")
            .select(
              "id,ride_request_id,rider_id,provider,provider_tx_ref,provider_reference,amount_etb,currency,status,paid_at,verified_at,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("driver_payout_requests")
            .select(
              "id,driver_id,provider,provider_reference,amount_etb,currency,status,failure_reason,processed_at,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(100),
        ]);

        if (payments.error) throw payments.error;
        if (payouts.error) throw payouts.error;

        data = [
          ...(payments.data || []).map((row) => ({
            ...row,
            kind: "rider_payment",
            user_id: row.rider_id,
          })),
          ...(payouts.data || []).map((row) => ({
            ...row,
            kind: "driver_payout",
            user_id: row.driver_id,
            ride_request_id: null,
          })),
        ].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        );
      } else if (module === "safety") {
        const result = await supabase
          .from("safety_reports")
          .select(
            "id,user_id,ride_request_id,trip_reference,category,status,details,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      } else if (module === "support") {
        const result = await supabase
          .from("support_requests")
          .select(
            "id,user_id,ride_request_id,category,status,details,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      } else if (module === "audit") {
        const result = await supabase
          .from("admin_action_log")
          .select(
            "id,actor_id,action,entity_type,entity_id,metadata,created_at",
          )
          .order("created_at", { ascending: false })
          .limit(100);
        if (result.error) throw result.error;
        data = result.data || [];
      }

      setRows(data);
    } catch {
      setRows([]);
      setError("This administrative data could not be loaded.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!admin) return;
    void loadMetrics();
    void loadRows();
  }, [admin, module, range]);

  useEffect(() => {
    if (!admin) return;

    const refreshFor = (target: Module) => {
      void loadMetrics();
      if (module === target) void loadRows();
    };

    const channel = supabase
      .channel("admin-live-current")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ride_requests" },
        () => refreshFor("rides"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers" },
        () => refreshFor("drivers"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payment_transactions" },
        () => refreshFor("finance"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "driver_payout_requests" },
        () => refreshFor("finance"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "safety_reports" },
        () => refreshFor("safety"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_requests" },
        () => refreshFor("support"),
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadMetrics();
    }, 15000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [admin, module, range]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginBusy(true);
    setError("");

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoginBusy(false);
      return;
    }

    if (data.session) await checkAdmin(data.session.user.id);
    setLoginBusy(false);
  };

  const action = async (fn: string, args: Row, success: string) => {
    const { error: actionError } = await supabase.rpc(fn, args);
    if (actionError) {
      toast(actionError.message);
      return;
    }
    toast(success);
    await loadRows();
    await loadMetrics();
  };

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(normalized),
      ),
    );
  }, [rows, query]);

  const active = Number(metrics.active_rides || 0);
  const revenue = Number(metrics.revenue_etb || 0);
  const drivers = Number(metrics.online_drivers || 0);
  const riders = Number(metrics.riders || 0);
  const openSafety = Number(metrics.open_safety || 0);
  const openSupport = Number(metrics.open_support || 0);
  const pendingReviews = Number(metrics.pending_driver_reviews || 0);

  if (loading) {
    return (
      <div className="admin-loading">
        <span />
        Securing NexRide Control Center…
      </div>
    );
  }

  if (!session || !admin) {
    return (
      <main className="admin-login">
        <div className="login-card">
          <div className="admin-mark">N</div>
          <p className="admin-kicker">NEXRIDE · CONTROL CENTER</p>
          <h1>Operations, with control.</h1>
          <p className="login-copy">
            Restricted administrative access. Rider and driver accounts cannot
            enter this workspace.
          </p>
          <form onSubmit={signIn}>
            <label>
              Admin email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button className="admin-primary" disabled={loginBusy}>
              {loginBusy ? "Authenticating…" : "Enter Control Center"}
              <span>→</span>
            </button>
          </form>
          <small>
            Access is enforced by Supabase Auth and admin RLS. Credentials are
            never stored by the dashboard.
          </small>
        </div>
      </main>
    );
  }

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-mark">N</div>
          <div>
            <b>NexRide</b>
            <small>Control Center</small>
          </div>
        </div>

        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={module === id ? "active" : ""}
              onClick={() => {
                setModule(id);
                setQuery("");
              }}
            >
              <i>{icon}</i>
              <span>{label}</span>
              {id === "safety" && openSafety > 0 ? (
                <em>{openSafety}</em>
              ) : id === "support" && openSupport > 0 ? (
                <em>{openSupport}</em>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="admin-side-foot">
          <span className="status-dot" /> Live database connected
          <div className="admin-user">
            <strong>{admin.full_name || "Administrator"}</strong>
            <small>{admin.admin_role?.replaceAll("_", " ") || "Admin"}</small>
          </div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <span className="admin-kicker">
              NEXRIDE / {module.toUpperCase()}
            </span>
            <h2>
              {module === "overview"
                ? "Operations overview"
                : nav.find((item) => item[0] === module)?.[1]}
            </h2>
          </div>
          <div className="header-actions">
            <span className="live-pill">
              <i />
              Live
            </span>
            <button
              className="header-icon"
              onClick={() => {
                void loadMetrics();
                void loadRows();
              }}
              aria-label="Refresh admin data"
            >
              ↻
            </button>
            <button className="theme-pill" disabled>
              ● Dark
            </button>
          </div>
        </header>

        {error && (
          <div
            className="login-error"
            style={{ margin: "16px 40px 0" }}
            role="alert"
          >
            {error}
          </div>
        )}

        {module === "overview" ? (
          <Overview
            metrics={{
              active,
              revenue,
              drivers,
              riders,
              openSafety,
              openSupport,
              pendingReviews,
              onlinePaid: Number(metrics.paid_online_etb || 0),
              payoutsPaid: Number(metrics.payouts_paid_etb || 0),
            }}
            range={range}
            setRange={setRange}
            setModule={setModule}
          />
        ) : (
          <DataModule
            module={module}
            rows={filtered}
            query={query}
            setQuery={setQuery}
            refreshing={refreshing}
            action={action}
            refresh={() => void loadRows()}
          />
        )}
      </section>

      {notice && <div className="admin-toast">{notice}</div>}
    </div>
  );
}

function Overview({
  metrics,
  range,
  setRange,
  setModule,
}: {
  metrics: Row;
  range: "today" | "7d" | "30d";
  setRange: (value: "today" | "7d" | "30d") => void;
  setModule: (module: Module) => void;
}) {
  return (
    <main className="admin-content">
      <div className="hero-row">
        <div>
          <p className="admin-kicker">REAL-TIME OPERATIONS</p>
          <h1>The network at a glance.</h1>
          <p>
            Current ride state, verified drivers, safety workload and real
            financial ledgers.
          </p>
        </div>
        <select
          value={range}
          onChange={(event) =>
            setRange(event.target.value as "today" | "7d" | "30d")
          }
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      <div className="metric-grid">
        <Metric
          label="Active rides"
          value={String(metrics.active)}
          detail="Accepted, pickup or in-trip"
          accent
        />
        <Metric
          label="Online drivers"
          value={String(metrics.drivers)}
          detail="Approved and available"
        />
        <Metric
          label="Completed revenue"
          value={formatMoney(metrics.revenue)}
          detail="Selected period"
        />
        <Metric
          label="Riders"
          value={String(metrics.riders)}
          detail="Active rider accounts"
        />
        <Metric
          label="Safety queue"
          value={String(metrics.openSafety)}
          detail="Submitted or reviewing"
          danger
        />
      </div>

      <div className="overview-grid">
        <section className="admin-card demand-card">
          <div className="card-head">
            <div>
              <span className="admin-kicker">NETWORK HEALTH</span>
              <h3>Operating signal</h3>
            </div>
            <span className="healthy">● Live</span>
          </div>
          <div className="signal">
            <div>
              <strong>{metrics.active}</strong>
              <small>rides in motion</small>
            </div>
            <div>
              <strong>{formatMoney(metrics.onlinePaid)}</strong>
              <small>verified online payments</small>
            </div>
            <div>
              <strong>{formatMoney(metrics.payoutsPaid)}</strong>
              <small>driver payouts paid</small>
            </div>
          </div>
          <div className="mini-chart">
            {[34, 46, 41, 58, 52, 67, 61, 73, 69, 82, 76, 88].map(
              (height, index) => (
                <span key={index} style={{ height: height + "%" }} />
              ),
            )}
          </div>
        </section>

        <section className="admin-card quick-card">
          <div className="card-head">
            <div>
              <span className="admin-kicker">ACTION QUEUE</span>
              <h3>Needs attention</h3>
            </div>
          </div>
          <Quick
            title="Driver verification"
            value={
              metrics.pendingReviews
                ? metrics.pendingReviews + " pending review"
                : "No pending driver reviews"
            }
            onClick={() => setModule("drivers")}
            icon="◆"
          />
          <Quick
            title="Safety desk"
            value={
              metrics.openSafety
                ? metrics.openSafety + " open reports"
                : "No open reports"
            }
            onClick={() => setModule("safety")}
            icon="!"
          />
          <Quick
            title="Support inbox"
            value={
              metrics.openSupport
                ? metrics.openSupport + " open requests"
                : "No open requests"
            }
            onClick={() => setModule("support")}
            icon="?"
          />
        </section>
      </div>

      <section className="admin-card module-strip">
        <div>
          <span className="admin-kicker">OPERATIONS</span>
          <h3>Move quickly</h3>
        </div>
        <div className="quick-actions">
          <button onClick={() => setModule("rides")}>
            Monitor rides <span>→</span>
          </button>
          <button onClick={() => setModule("drivers")}>
            Verify drivers <span>→</span>
          </button>
          <button onClick={() => setModule("finance")}>
            Review finance <span>→</span>
          </button>
          <button onClick={() => setModule("audit")}>
            Inspect audit <span>→</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  accent,
  danger,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={"metric " + (accent ? "accent " : "") + (danger ? "danger" : "")}
    >
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Quick({
  title,
  value,
  onClick,
  icon,
}: {
  title: string;
  value: string;
  onClick: () => void;
  icon: string;
}) {
  return (
    <button className="queue-row" onClick={onClick}>
      <i>{icon}</i>
      <span>
        <b>{title}</b>
        <small>{value}</small>
      </span>
      <strong>→</strong>
    </button>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-ET", {
    style: "currency",
    currency: "ETB",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ET", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(String(value)));
}

function DataModule({
  module,
  rows,
  query,
  setQuery,
  refreshing,
  action,
  refresh,
}: {
  module: Module;
  rows: Row[];
  query: string;
  setQuery: (value: string) => void;
  refreshing: boolean;
  action: (fn: string, args: Row, message: string) => void;
  refresh: () => void;
}) {
  const title = nav.find((item) => item[0] === module)?.[1] || "Records";

  const columns =
    module === "rides"
      ? [
          "id",
          "ride_category",
          "status",
          "pickup_location",
          "destination_location",
          "final_fare_etb",
          "payment_status",
          "created_at",
        ]
      : module === "drivers"
        ? [
            "id",
            "review_status",
            "is_online",
            "rating",
            "vehicle",
            "vehicle_plate",
            "created_at",
          ]
        : module === "users"
          ? [
              "full_name",
              "phone",
              "role",
              "admin_role",
              "account_status",
              "created_at",
            ]
          : module === "finance"
            ? [
                "kind",
                "provider",
                "amount_etb",
                "currency",
                "status",
                "user_id",
                "ride_request_id",
                "created_at",
              ]
            : module === "safety"
              ? [
                  "category",
                  "status",
                  "ride_request_id",
                  "details",
                  "created_at",
                ]
              : module === "support"
                ? [
                    "category",
                    "status",
                    "ride_request_id",
                    "details",
                    "created_at",
                  ]
                : ["action", "entity_type", "entity_id", "created_at"];

  const hasActions =
    module === "drivers" ||
    module === "rides" ||
    module === "safety" ||
    module === "support";

  return (
    <main className="admin-content">
      <div className="module-head">
        <div>
          <p className="admin-kicker">OPERATIONS DATA</p>
          <h1>{title}</h1>
          <p>
            {module === "rides"
              ? "Current NexRide requests, assignment state, fare and payment status."
              : module === "drivers"
                ? "Verification, availability and driver health."
                : module === "users"
                  ? "Rider, driver and administrative identities."
                  : module === "finance"
                    ? "Verified rider payments and driver payout requests."
                    : module === "safety"
                      ? "Safety reports submitted through the live Safety Center."
                      : module === "support"
                        ? "Customer and driver support requests from the production app."
                        : "Administrative actions recorded by the control plane."}
          </p>
        </div>
        <div className="module-tools">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={"Search " + title.toLowerCase() + "…"}
          />
          <button onClick={refresh} aria-label={"Refresh " + title}>
            ↻
          </button>
        </div>
      </div>

      <section className="admin-card table-card">
        <div className="table-meta">
          <span>{rows.length} records shown</span>
          {refreshing && <span className="syncing">Syncing…</span>}
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column.replaceAll("_", " ")}</th>
                ))}
                {hasActions && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row, index) => (
                  <tr key={row.id || index}>
                    {columns.map((column) => (
                      <td key={column}>{renderCell(column, row[column])}</td>
                    ))}

                    {module === "drivers" && (
                      <td className="actions">
                        {row.license_document_path && (
                          <button
                            onClick={() => void openAdminDriverDocument(row.license_document_path)}
                          >
                            License
                          </button>
                        )}
                        {row.vehicle_registration_path && (
                          <button
                            onClick={() => void openAdminDriverDocument(row.vehicle_registration_path)}
                          >
                            Registration
                          </button>
                        )}
                        {row.review_status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                action(
                                  "admin_driver_review",
                                  {
                                    p_driver_id: row.id,
                                    p_status: "approved",
                                  },
                                  "Driver approved",
                                )
                              }
                            >
                              Approve
                            </button>
                            <button
                              className="danger-action"
                              onClick={() =>
                                action(
                                  "admin_driver_review",
                                  {
                                    p_driver_id: row.id,
                                    p_status: "rejected",
                                  },
                                  "Driver rejected",
                                )
                              }
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {row.review_status === "approved" && (
                          <button
                            className="danger-action"
                            onClick={() =>
                              action(
                                "admin_driver_review",
                                {
                                  p_driver_id: row.id,
                                  p_status: "suspended",
                                },
                                "Driver suspended",
                              )
                            }
                          >
                            Suspend
                          </button>
                        )}
                      </td>
                    )}

                    {module === "rides" && (
                      <td className="actions">
                        {!["completed", "cancelled", "withdrawn"].includes(
                          row.status,
                        ) && (
                          <button
                            className="danger-action"
                            onClick={() =>
                              action(
                                "admin_cancel_ride_request",
                                {
                                  p_ride_request_id: row.id,
                                  p_reason: "admin_intervention",
                                },
                                "Ride cancelled",
                              )
                            }
                          >
                            Intervene
                          </button>
                        )}
                      </td>
                    )}

                    {module === "safety" && (
                      <td className="actions">
                        {row.status === "submitted" && (
                          <button
                            onClick={() =>
                              action(
                                "admin_safety_update",
                                {
                                  p_report_id: row.id,
                                  p_status: "reviewing",
                                },
                                "Safety report moved to review",
                              )
                            }
                          >
                            Review
                          </button>
                        )}
                        {row.status !== "resolved" && (
                          <button
                            onClick={() =>
                              action(
                                "admin_safety_update",
                                {
                                  p_report_id: row.id,
                                  p_status: "resolved",
                                },
                                "Safety report resolved",
                              )
                            }
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    )}

                    {module === "support" && (
                      <td className="actions">
                        {row.status === "submitted" && (
                          <button
                            onClick={() =>
                              action(
                                "admin_support_update",
                                {
                                  p_request_id: row.id,
                                  p_status: "reviewing",
                                },
                                "Support request moved to review",
                              )
                            }
                          >
                            Review
                          </button>
                        )}
                        {row.status !== "resolved" && (
                          <button
                            onClick={() =>
                              action(
                                "admin_support_update",
                                {
                                  p_request_id: row.id,
                                  p_status: "resolved",
                                },
                                "Support request resolved",
                              )
                            }
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)}>
                    <div className="empty">
                      <span>⌁</span>
                      <b>No records yet</b>
                      <small>
                        This module is connected to the current NexRide production
                        schema.
                      </small>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

async function openAdminDriverDocument(path: unknown) {
  if (typeof path !== "string" || !path) return;

  const preview = window.open("", "_blank");
  try {
    const { data, error } = await supabase.storage
      .from("driver-verification")
      .createSignedUrl(path, 300);

    if (error || !data?.signedUrl) throw error || new Error("Document unavailable");

    if (preview) {
      preview.opener = null;
      preview.location.href = data.signedUrl;
    } else {
      window.location.assign(data.signedUrl);
    }
  } catch {
    preview?.close();
    window.alert("This driver document could not be opened. Refresh the Drivers list and try again.");
  }
}

function renderCell(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";

  if (key.endsWith("_at") || key === "created_at" || key === "updated_at")
    return formatDate(value);

  if (
    key === "amount_etb" ||
    key === "final_fare_etb" ||
    key === "estimated_trip_fare_etb"
  )
    return formatMoney(Number(value));

  if (typeof value === "boolean")
    return value ? (
      <span className="bool yes">Yes</span>
    ) : (
      <span className="bool">No</span>
    );

  if (
    key === "status" ||
    key === "payment_status" ||
    key === "review_status" ||
    key === "account_status"
  )
    return (
      <span className={"tag " + String(value).toLowerCase()}>
        {String(value).replaceAll("_", " ")}
      </span>
    );

  if (key === "id" || key.endsWith("_id"))
    return <code>{String(value).slice(0, 8)}…</code>;

  const rendered = typeof value === "object" ? JSON.stringify(value) : String(value);
  return rendered.length > 70 ? rendered.slice(0, 70) + "…" : rendered;
}

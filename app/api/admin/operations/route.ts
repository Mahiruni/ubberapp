import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { withOperationTimeout } from "../../../../lib/nexride-operation";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Read-only investigation over existing records. No payment or payout commands. */
export async function GET(request: Request) {
  try {
    const auth = await withOperationTimeout(authorizedRequestSupabase(request));
    if (!auth) return reply({ status: "unauthorized" }, 401);
    const db = auth.client;
    const { data: actor, error: actorError } = await withOperationTimeout(db.from("profiles")
      .select("role,account_status").eq("id", auth.user.id).maybeSingle());
    if (actorError) return reply({ status: "status_unavailable" }, 503);
    if (actor?.role !== "admin" || actor.account_status !== "active") return reply({ status: "forbidden" }, 403);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id") || "";
    if (kind === "finance") {
      const signal = AbortSignal.timeout(15_000);
      // Financial source tables deliberately deny all browser roles. Read
      // them on the server only after verifying this active Admin above.
      const finance = serverAdminSupabase();
      const queries = [
        { title: "Commission snapshots (ETB)", query: finance.from("commission_quote_snapshots")
          .select("id,ride_request_id,driver_id,ride_category,gross_minor,commission_minor,driver_share_minor,currency,status,calculated_at")
          .order("calculated_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Earnings ledger", query: db.from("driver_earnings_ledger")
          .select("id,driver_id,ride_request_id,entry_type,amount_etb,status,effective_at")
          .order("effective_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Settlement requests", query: db.from("driver_payout_requests")
          .select("id,driver_id,amount_etb,currency,status,created_at,processed_at,failure_reason")
          .order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Reconciliation exceptions", query: finance.from("financial_reconciliation_exceptions")
          .select("id,source_kind,source_reference,exception_type,severity,status,notes,created_at")
          .order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
      ];
      const sections = await Promise.all(queries.map(async ({ title, query }) => {
        const loaded = await query;
        return { title, unavailable: Boolean(loaded.error), rows: loaded.error ? [] :
          (loaded.data || []).map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
            key.endsWith("_minor") ? [key.replace(/_minor$/, "_etb"), value === null ? null : Number(value) / 100] : [key, value]))) };
      }));
      return reply({ status: "ready", record: { mode: "Read-only financial oversight", currency: "ETB" }, sections,
        note: "Saved records only; latest 50 per section. A posting or commission quote is not payment confirmation. No payment, payout or gateway activation controls are available here." });
    }
    if (!uuid.test(id) || !["ride", "driver"].includes(kind || "")) return reply({ status: "invalid_request" }, 400);
    const signal = AbortSignal.timeout(15_000);
    const result = kind === "driver"
      ? await db.from("drivers").select("id,vehicle,vehicle_color,vehicle_plate,review_status,rejection_reason,license_expiry,is_online,rating,submitted_at,reviewed_at,created_at")
        .eq("id", id).abortSignal(signal).maybeSingle()
      : await db.from("ride_requests").select("id,rider_id,assigned_driver_id,status,ride_category,pickup_location,destination_location,estimated_trip_fare_etb,estimated_driver_payout_etb,final_fare_etb,payment_method,payment_status,created_at,accepted_at,pickup_arrived_at,started_at,completed_at,cancelled_at,cancellation_reason")
        .eq("id", id).abortSignal(signal).maybeSingle();
    if (result.error) return reply({ status: "records_unavailable" }, 503);
    if (!result.data) return reply({ status: "not_found" }, 404);

    const audit = db.from("admin_action_log").select("id,action,metadata,created_at")
      .eq("entity_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal);
    const earnings = db.from("driver_earnings_ledger").select("id,ride_request_id,entry_type,amount_etb,status,label,effective_at")
      .eq(kind === "driver" ? "driver_id" : "ride_request_id", id)
      .order("effective_at", { ascending: false }).limit(50).abortSignal(signal);
    const related = kind === "driver"
      ? [
        { title: "Account", query: db.from("profiles").select("full_name,phone,account_status").eq("id", id).limit(1).abortSignal(signal) },
        { title: "Verification history", query: audit },
        { title: "Earnings ledger", query: earnings },
        { title: "Settlement requests", query: db.from("driver_payout_requests").select("id,amount_etb,currency,status,created_at,processed_at,failure_reason")
          .eq("driver_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
      ]
      : [
        { title: "Dispatch offers", query: db.from("ride_request_offers").select("id,driver_id,status,pickup_distance_km,pickup_eta_minutes,created_at,expires_at,updated_at")
          .eq("request_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Audit events", query: audit },
        { title: "Earnings ledger", query: earnings },
        { title: "Payment records", query: db.from("payment_transactions").select("id,provider,amount_etb,currency,status,paid_at,verified_at,created_at")
          .eq("ride_request_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Support and disputes", query: db.from("support_requests").select("id,category,status,details,created_at,updated_at")
          .eq("ride_request_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
        { title: "Safety reports", query: db.from("safety_reports").select("id,category,status,details,created_at,updated_at")
          .eq("ride_request_id", id).order("created_at", { ascending: false }).limit(50).abortSignal(signal) },
      ];
    const sections = await Promise.all(related.map(async ({ title, query }) => {
      const loaded = await query;
      return { title, rows: loaded.error ? [] : loaded.data || [], unavailable: Boolean(loaded.error) };
    }));
    return reply({ status: "ready", record: result.data, sections,
      note: "Amounts and statuses come from saved records. Ledger postings do not confirm payment or settlement. Most recent 50 records per section." });
  } catch { return reply({ status: "unavailable" }, 503); }
}

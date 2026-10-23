import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { matchingProgress } from "../../../../../lib/biloo-journey";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type RouteContext = { params: Promise<{ requestId: string }> };

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableSnapshot(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const driver = record.driver;
  const cancellation = record.cancellation;
  return {
    ...record,
    // Older database responses stripped nullable keys. Normalize them at the
    // API boundary so healthy requests never look like connection failures.
    ...(cancellation && typeof cancellation === "object"
      ? { cancellation: { reason: null, ...(cancellation as Record<string, unknown>) } }
      : {}),
    ...(driver && typeof driver === "object"
      ? { driver: { pickupMinutes: null, ...(driver as Record<string, unknown>) } }
      : {}),
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  if (!validId(requestId)) return reply({ status: "invalid" }, 400);

  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unavailable" }, 401);

  // The token was verified above. Query the authoritative Postgres snapshot
  // directly rather than depending on a second Edge Function authentication
  // hop for every poll and manual refresh.
  try {
    const { data, error } = await serverAdminSupabase().rpc(
      "rider_match_snapshot_server",
      { p_actor: authorized.user.id, p_request_id: requestId },
    );
    if (error) {
      console.error("rider_matching_snapshot_failed", { code: error.code || "unknown" });
      return reply({ status: "unavailable" }, error.message?.includes("REQUEST_NOT_FOUND") ? 404 : 503);
    }
    if (!data) return reply({ status: "unavailable" }, 503);
    // Progress is derived from persisted dispatch records, not a local timer
    // or fabricated nearby Drivers. A missing optional progress read must not
    // hide the authoritative matching/cancellation snapshot.
    let progress;
    try {
      const admin = serverAdminSupabase();
      const [rideResult, offersResult] = await Promise.all([
        admin.from('ride_requests').select('created_at,status,dispatch_state,match_version')
          .eq('id', requestId).eq('rider_id', authorized.user.id).maybeSingle(),
        admin.from('ride_request_offers').select('status,created_at,expires_at')
          .eq('request_id', requestId).order('created_at', { ascending: false }).limit(100),
      ]);
      if (!rideResult.error && !offersResult.error && rideResult.data &&
        rideResult.data.match_version === (data as { version: number }).version)
        progress = matchingProgress(rideResult.data, offersResult.data || []);
    } catch { /* Preserve the verified snapshot if optional metadata fails. */ }
    const snapshot = stableSnapshot(data);
    return reply(progress && snapshot && typeof snapshot === 'object'
      ? { ...snapshot, progress } : snapshot);
  } catch {
    console.error("rider_matching_snapshot_service_unavailable");
    return reply({ status: "unavailable" }, 503);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  if (!validId(requestId)) return reply({ status: "invalid" }, 400);

  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unavailable" }, 401);

  try {
    const body = await request.json();
    const action = body?.action;
    const expectedVersion = body?.expectedVersion;

    if (
      (action !== "cancel" && action !== "retry") ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 0
    ) {
      return reply({ status: "invalid" }, 400);
    }

    const { data, error } = await serverAdminSupabase().rpc(
      "rider_request_action_server",
      {
        p_actor: authorized.user.id,
        p_request_id: requestId,
        p_expected_version: expectedVersion,
        p_action: action,
      },
    );

    if (error) {
      console.error("rider_matching_action_failed", { code: error.code || "unknown" });
      return reply({ status: "unavailable" }, error.message?.includes("REQUEST_NOT_FOUND") ? 404 : 503);
    }

    const result = data as { conflict?: unknown; snapshot?: unknown } | null;
    if (!result?.snapshot) return reply({ status: "unavailable" }, 503);

    return reply(stableSnapshot(result.snapshot), result.conflict === true ? 409 : 200);
  } catch {
    console.error("rider_matching_action_service_unavailable");
    return reply({ status: "unavailable" }, 503);
  }
}

import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

type RouteContext = { params: Promise<{ requestId: string }> };

function validId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  if (!validId(requestId)) return reply({ status: "invalid" }, 400);

  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unavailable" }, 401);

  const { data, error } = await authorized.client.rpc("rider_match_snapshot", {
    p_request_id: requestId,
  });

  if (error) {
    if ((error.message || "").includes("REQUEST_NOT_FOUND"))
      return reply({ status: "not_found" }, 404);
    return reply({ status: "unavailable" }, 500);
  }

  return reply(data);
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

    const { data, error } = await authorized.client.rpc(
      "rider_request_action",
      {
        p_request_id: requestId,
        p_expected_version: expectedVersion,
        p_action: action,
      },
    );

    if (error) {
      if ((error.message || "").includes("REQUEST_NOT_FOUND"))
        return reply({ status: "not_found" }, 404);
      return reply({ status: "unavailable" }, 500);
    }

    const result = data as { conflict?: unknown; snapshot?: unknown } | null;
    if (!result?.snapshot) return reply({ status: "unavailable" }, 500);

    return reply(result.snapshot, result.conflict === true ? 409 : 200);
  } catch {
    return reply({ status: "invalid" }, 400);
  }
}

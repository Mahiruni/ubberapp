import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";

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
  if (!driver || typeof driver !== "object" || Object.prototype.hasOwnProperty.call(driver, "pickupMinutes")) return value;
  return {
    ...record,
    driver: { ...(driver as Record<string, unknown>), pickupMinutes: null },
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { requestId } = await context.params;
  if (!validId(requestId)) return reply({ status: "invalid" }, 400);
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unavailable" }, 401);

  const { data, error } = await authorized.client.functions.invoke(
    "nexride-rider-booking",
    { body: { operation: "snapshot", requestId } },
  );
  if (error || !data) return reply({ status: "unavailable" }, 500);
  return reply(stableSnapshot(data));
}

export async function POST(request: Request, context: RouteContext) {
  const { requestId } ¶»§q«^
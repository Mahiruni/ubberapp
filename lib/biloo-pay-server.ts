import type { SupabaseClient } from "@supabase/supabase-js";
import { bilooPayConfiguration } from "./biloo-pay-config";
import { authorizedRequestSupabase } from "./nexride-server-supabase";
import { serverAdminSupabase } from "./nexride-server-admin";
import { payIdempotencyKey } from "./biloo-pay-money";

export const payReply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function payRpc<T = Record<string, unknown>>(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw Error(error.message);
  return data as T;
}
export async function requirePayReady(admin: SupabaseClient, writes = true) {
  const config = bilooPayConfiguration();
  if (!config.enabled) throw Error("BILOO_PAY_NOT_ENABLED");
  const caps = await payRpc(admin, "biloo_pay_capabilities_server");
  if (
    caps?.schemaVersion !== config.schemaVersion ||
    (writes && caps.writesEnabled !== true) ||
    (writes && caps.mode !== process.env.PAYMENT_MODE)
  )
    throw Error("BILOO_PAY_SETUP_REQUIRED");
}
export async function payAccess(
  request: Request,
  role?: "rider" | "driver" | "admin",
  writes = true,
) {
  const auth = await authorizedRequestSupabase(request);
  if (!auth) throw Error("BILOO_PAY_UNAUTHORIZED");
  const { data, error } = await auth.client
    .from("profiles")
    .select("role,admin_role,account_status")
    .eq("id", auth.user.id)
    .single();
  if (
    error ||
    !data ||
    data.account_status !== "active" ||
    (role && data.role !== role)
  )
    throw Error("BILOO_PAY_FORBIDDEN");
  if (
    data.role === "admin" &&
    !["super_admin", "finance"].includes(data.admin_role)
  )
    throw Error("BILOO_PAY_FORBIDDEN");
  const admin = serverAdminSupabase();
  await requirePayReady(admin, writes);
  return { ...auth, admin, role: data.role as string };
}
export function payKey(request: Request) {
  const key = request.headers.get("idempotency-key");
  if (!payIdempotencyKey(key)) throw Error("BILOO_PAY_INVALID_KEY");
  return key;
}
export async function payBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const raw = await readPayBody(request);
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {}
  throw Error("BILOO_PAY_INVALID_BODY");
}
export async function readPayBody(request: Request, max = 65536) {
  if (Number(request.headers.get("content-length")) > max)
    throw Error("BILOO_PAY_BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) throw Error("BILOO_PAY_INVALID_BODY");
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw Error("BILOO_PAY_BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function payError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const known = /BILOO_PAY_([A-Z_]+)/.exec(message)?.[1]?.toLowerCase();
  const status =
    known === "rate_limited"
      ? 429
      : known === "unauthorized"
        ? 401
        : known === "forbidden"
          ? 403
          : known?.includes("invalid")
            ? 400
            : known === "body_too_large"
              ? 413
              : known === "not_enabled" || known === "setup_required"
                ? 503
                : known
                  ? 409
                  : 503;
  return payReply({ status: known || "unavailable" }, status);
}
export function payOrigin() {
  // Never build payment return URLs from an untrusted Host header.
  const raw = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) throw Error("BILOO_PAY_SETUP_REQUIRED");
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("BILOO_PAY_SETUP_REQUIRED");
  return url.origin;
}

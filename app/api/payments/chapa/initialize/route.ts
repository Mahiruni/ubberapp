import { randomUUID } from "node:crypto";
import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
  initializeChapaPayment,
  paymentConfiguration,
} from "../../../../../lib/nexride-payments";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const numeric = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function POST(request: Request) {
  if (!paymentConfiguration().enabled)
    return reply({ status: "not_configured", provider: null }, 503);

  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || "";
  if (idempotencyKey.length < 16 || idempotencyKey.length > 120)
    return reply({ status: "invalid_idempotency_key" }, 400);

  let rideRequestId = "";
  try {
    const body = await request.json();
    rideRequestId =
      typeof body?.rideRequestId === "string" ? body.rideRequestId : "";
  } catch {
    return reply({ status: "invalid" }, 400);
  }

  if (!rideRequestId) return reply({ status: "invalid" }, 400);

  const { data: ride, error: rideError } = await authorized.client
    .from("ride_requests")
    .select(
      "id,rider_id,status,payment_status,payment_method,final_fare_etb,estimated_trip_fare_etb",
    )
    .eq("id", rideRequestId)
    .eq("rider_id", authorized.user.id)
    .maybeSingle();

  if (rideError || !ride) return reply({ status: "not_found" }, 404);
  if (ride.status !== "completed")
    return reply({ status: "trip_not_completed" }, 409);
  if (ride.payment_status === "paid")
    return reply({ status: "already_paid" }, 409);

  const amount = numeric(ride.final_fare_etb ?? ride.estimated_trip_fare_etb);
  if (amount === null || amount <= 0)
    return reply({ status: "amount_unavailable" }, 409);
  if (!authorized.user.email)
    return reply({ status: "email_required" }, 409);

  const admin = serverAdminSupabase();

  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id,status,checkout_url,provider_tx_ref,amount_etb")
    .eq("rider_id", authorized.user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing) {
    if (Number(existing.amount_etb) !== amount)
      return reply({ status: "idempotency_conflict" }, 409);
    if (existing.status === "paid")
      return reply({ status: "already_paid" }, 409);
    if (
      (existing.status === "initialized" || existing.status === "pending") &&
      typeof existing.checkout_url === "string" &&
      existing.checkout_url
    ) {
      return reply({
        status: "ready",
        checkoutUrl: existing.checkout_url,
        transactionId: existing.id,
      });
    }
  }

  const txRef = existing?.provider_tx_ref || `nexride-${ride.id}-${randomUUID()}`;
  let transactionId = existing?.id || "";

  if (!existing) {
    const { data: created, error: createError } = await admin
      .from("payment_transactions")
      .insert({
        ride_request_id: ride.id,
        rider_id: authorized.user.id,
        provider: "chapa",
        provider_tx_ref: txRef,
        idempotency_key: idempotencyKey,
        amount_etb: amount,
        currency: "ETB",
        status: "initialized",
      })
      .select("id")
      .single();

    if (createError || !created)
      return reply({ status: "transaction_create_failed" }, 500);
    transactionId = created.id;
  }

  const origin = new URL(request.url).origin;
  const callbackUrl =
    origin +
    "/api/payments/chapa/callback?trx_ref=" +
    encodeURIComponent(txRef);
  const returnUrl = callbackUrl + "&return=1";

  const fullName =
    typeof authorized.user.user_metadata?.full_name === "string"
      ? authorized.user.user_metadata.full_name.trim()
      : "";
  const [firstName, ...lastParts] = fullName.split(/\s+/).filter(Boolean);

  try {
    const initialized = await initializeChapaPayment({
      txRef,
      amount,
      email: authorized.user.email,
      firstName: firstName || undefined,
      lastName: lastParts.join(" ") || undefined,
      returnUrl,
      callbackUrl,
    });

    const { error: saveError } = await admin
      .from("payment_transactions")
      .update({
        status: "pending",
        checkout_url: initialized.checkoutUrl,
        provider_payload: initialized.providerPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    if (saveError)
      return reply({ status: "transaction_update_failed" }, 500);

    await admin
      .from("ride_requests")
      .update({ payment_method: "chapa", payment_status: "pending" })
      .eq("id", ride.id)
      .eq("rider_id", authorized.user.id)
      .eq("status", "completed");

    return reply({
      status: "ready",
      checkoutUrl: initialized.checkoutUrl,
      transactionId,
    });
  } catch {
    await admin
      .from("payment_transactions")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", transactionId);

    return reply({ status: "provider_failed" }, 502);
  }
}

import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { paymentConfiguration, verifyChapaPayment } from "../../../../../lib/nexride-payments";

function redirectFor(request: Request, rideRequestId: string, status: string) {
  const url = new URL("/rider/trips/receipt", request.url);
  url.searchParams.set("ride", rideRequestId);
  url.searchParams.set("payment", status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const txRef = url.searchParams.get("merchant_reference") ||
    url.searchParams.get("trx_ref") || url.searchParams.get("tx_ref") || "";
  const shouldRedirect = url.searchParams.get("return") === "1";

  if (!paymentConfiguration().enabled) {
    if (shouldRedirect) {
      const wallet = new URL("/rider/wallet", request.url);
      wallet.searchParams.set("payment", "not_configured");
      return Response.redirect(wallet, 303);
    }
    return Response.json({ status: "not_configured" }, { status: 503 });
  }
  if (!txRef) return Response.json({ status: "invalid" }, { status: 400 });

  const admin = serverAdminSupabase();
  const { data: transaction, error } = await admin
    .from("payment_transactions")
    .select("id,ride_request_id,provider_tx_ref,provider_reference,amount_etb,status")
    .eq("provider", "chapa")
    .eq("provider_tx_ref", txRef)
    .maybeSingle();
  if (error || !transaction) return Response.json({ status: "not_found" }, { status: 404 });

  const respond = (status: string, code = 200) =>
    shouldRedirect
      ? redirectFor(request, transaction.ride_request_id, status)
      : Response.json({ status }, { status: code, headers: { "Cache-Control": "no-store" } });

  if (transaction.status === "paid") return respond("paid");

  const chapaReference = transaction.provider_reference ||
    url.searchParams.get("chapa_reference");
  if (!chapaReference) return respond("pending", 202);

  const result = await verifyChapaPayment({
    txRef: transaction.provider_tx_ref,
    amount: Number(transaction.amount_etb),
    chapaReference,
  }).catch(() => null);
  if (!result || result.state === "unverified" || result.state === "pending")
    return respond("pending", 202);

  if (result.state === "failed") {
    await admin.from("payment_transactions")
      .update({
        status: "failed",
        verified_at: new Date().toISOString(),
        provider_payload: result.providerPayload || {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.id)
      .in("status", ["initialized", "pending"]);
    return respond("failed", 409);
  }

  const { error: markError } = await admin.rpc("mark_payment_paid_server", {
    p_transaction_id: transaction.id,
    p_provider_reference: result.reference,
    p_provider_payload: result.providerPayload || {},
  });
  return markError ? respond("verification_error", 500) : respond("paid");
}

import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
  paymentConfiguration,
  verifyChapaPayment,
} from "../../../../../lib/nexride-payments";

function redirectFor(request: Request, rideRequestId: string, status: string) {
  const url = new URL("/rider/trips/receipt", request.url);
  url.searchParams.set("ride", rideRequestId);
  url.searchParams.set("payment", status);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const txRef =
    url.searchParams.get("trx_ref") ||
    url.searchParams.get("tx_ref") ||
    "";
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
    .select("id,ride_request_id,provider_tx_ref,amount_etb,status")
    .eq("provider", "chapa")
    .eq("provider_tx_ref", txRef)
    .maybeSingle();

  if (error || !transaction)
    return Response.json({ status: "not_found" }, { status: 404 });

  if (transaction.status === "paid") {
    return shouldRedirect
      ? redirectFor(request, transaction.ride_request_id, "paid")
      : Response.json({ status: "paid" });
  }

  const verified = await verifyChapaPayment({
    txRef,
    amount: Number(transaction.amount_etb),
  }).catch(() => null);

  if (!verified?.verified) {
    await admin
      .from("payment_transactions")
      .update({
        status: "failed",
        verified_at: new Date().toISOString(),
        provider_payload: verified?.providerPayload || {},
        updated_at: new Date().toISOString(),
      })
      .eq("id", transaction.id);

    return shouldRedirect
      ? redirectFor(request, transaction.ride_request_id, "failed")
      : Response.json({ status: "failed" }, { status: 400 });
  }

  const { error: markError } = await admin.rpc("mark_payment_paid_server", {
    p_transaction_id: transaction.id,
    p_provider_reference: verified.reference,
    p_provider_payload: verified.providerPayload || {},
  });

  if (markError) {
    return shouldRedirect
      ? redirectFor(request, transaction.ride_request_id, "verification_error")
      : Response.json({ status: "verification_error" }, { status: 500 });
  }

  return shouldRedirect
    ? redirectFor(request, transaction.ride_request_id, "paid")
    : Response.json({ status: "paid" });
}

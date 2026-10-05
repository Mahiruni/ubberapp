import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
  paymentConfiguration,
  validChapaWebhookSignature,
  verifyChapaPayment,
} from "../../../../../lib/nexride-payments";

const getTxRef = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const root = value as Record<string, unknown>;
  if (typeof root.tx_ref === "string") return root.tx_ref;
  if (typeof root.trx_ref === "string") return root.trx_ref;
  const data =
    root.data && typeof root.data === "object"
      ? root.data as Record<string, unknown>
      : null;
  if (typeof data?.tx_ref === "string") return data.tx_ref;
  if (typeof data?.trx_ref === "string") return data.trx_ref;
  return "";
};

export async function POST(request: Request) {
  if (!paymentConfiguration().enabled)
    return Response.json({ status: "not_configured" }, { status: 503 });

  const raw = await request.text();
  const signature =
    request.headers.get("x-chapa-signature") ||
    request.headers.get("chapa-signature");

  if (!validChapaWebhookSignature(raw, signature))
    return Response.json({ status: "invalid_signature" }, { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ status: "invalid" }, { status: 400 });
  }

  const txRef = getTxRef(payload);
  if (!txRef) return Response.json({ status: "ignored" });

  const admin = serverAdminSupabase();
  const { data: transaction, error } = await admin
    .from("payment_transactions")
    .select("id,provider_tx_ref,amount_etb,status")
    .eq("provider", "chapa")
    .eq("provider_tx_ref", txRef)
    .maybeSingle();

  if (error || !transaction)
    return Response.json({ status: "ignored" });

  if (transaction.status === "paid")
    return Response.json({ status: "paid" });

  const verified = await verifyChapaPayment({
    txRef,
    amount: Number(transaction.amount_etb),
  }).catch(() => null);

  if (!verified?.verified) {
    return Response.json({ status: "unverified" }, { status: 202 });
  }

  const { error: markError } = await admin.rpc("mark_payment_paid_server", {
    p_transaction_id: transaction.id,
    p_provider_reference: verified.reference,
    p_provider_payload: verified.providerPayload || payload || {},
  });

  if (markError)
    return Response.json({ status: "update_failed" }, { status: 500 });

  return Response.json({ status: "paid" });
}

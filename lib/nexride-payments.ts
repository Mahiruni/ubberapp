import { createHmac, timingSafeEqual } from "node:crypto";
import { bilooPayConfiguration } from "./biloo-pay-config";
import { etbDecimal, etbMinor } from "./biloo-pay-money";

const CHAPA_API = "https://api.chapa.co/v1";
export function paymentConfiguration() {
  const mode = process.env.PAYMENT_MODE;
  const enabled =
    bilooPayConfiguration().enabled &&
    process.env.NEXRIDE_PAYMENTS_ENABLED === "true" &&
    process.env.PAYMENT_PROVIDER === "chapa" &&
    !!process.env.PAYMENT_SECRET_KEY &&
    !!process.env.PAYMENT_WEBHOOK_SECRET &&
    (mode === "live" || mode === "test");
  return {
    enabled,
    provider: enabled ? ("chapa" as const) : null,
    mode: mode === "live" ? ("live" as const) : ("test" as const),
  };
}
function providerSecret() {
  if (!paymentConfiguration().enabled) throw Error("PAYMENTS_NOT_CONFIGURED");
  return process.env.PAYMENT_SECRET_KEY!;
}
export function chapaCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "checkout.chapa.co" &&
      !url.port &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export async function initializeChapaPayment(input: {
  txRef: string;
  amount: number;
  email: string;
  firstName?: string;
  lastName?: string;
  returnUrl: string;
  callbackUrl: string;
}) {
  const minor = etbMinor(input.amount);
  if (minor == null || minor <= 0) throw Error("INVALID_MONEY");
  const response = await fetch(CHAPA_API + "/transaction/initialize", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: "Bearer " + providerSecret(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amount: etbDecimal(minor),
      currency: "ETB",
      email: input.email,
      first_name: input.firstName || "Biloo",
      last_name: input.lastName || "Rider",
      tx_ref: input.txRef,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      customization: {
        title: "Biloo trip payment",
        description: "Biloo completed ride",
      },
    }),
  });
  const payload = await response.json().catch(() => null);
  const checkoutUrl = chapaCheckoutUrl(payload?.data?.checkout_url);
  if (!response.ok || payload?.status !== "success" || !checkoutUrl)
    throw Error("PAYMENT_INITIALIZATION_UNRESOLVED");
  return { checkoutUrl };
}
export type ChapaEvidence = {
  status: "success";
  txRef: string;
  amountMinor: number;
  currency: "ETB";
  mode: "live" | "test";
  reference: string;
};
export async function verifyChapaPayment(input: {
  txRef: string;
  amount: number;
  mode?: "live" | "test";
}) {
  const response = await fetch(
    CHAPA_API + "/transaction/verify/" + encodeURIComponent(input.txRef),
    {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + providerSecret(),
        Accept: "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => null);
  const data = payload?.data;
  const expected = etbMinor(input.amount);
  const actual = etbMinor(data?.amount);
  const mode = input.mode || paymentConfiguration().mode;
  const reference =
    typeof data?.reference === "string" && data.reference.trim()
      ? data.reference
      : null;
  const verified =
    response.ok &&
    payload?.status === "success" &&
    data?.status === "success" &&
    expected !== null &&
    actual === expected &&
    data?.tx_ref === input.txRef &&
    data?.currency === "ETB" &&
    data?.mode === mode &&
    reference !== null;
  const evidence: ChapaEvidence | null = verified
    ? {
        status: "success",
        txRef: input.txRef,
        amountMinor: actual!,
        currency: "ETB",
        mode,
        reference: reference!,
      }
    : null;
  // A provider error, pending response, mismatch or timeout is NEVER treated as payment failure/completion.
  return { verified, reference, evidence };
}
export function validChapaWebhookSignature(
  rawBody: string,
  signature: string | null,
) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

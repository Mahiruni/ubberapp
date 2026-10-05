import { createHmac, timingSafeEqual } from "node:crypto";

const CHAPA_API = "https://api.chapa.co/v1";

const enabledFlag = () =>
  /^(1|true|yes|on)$/i.test((process.env.NEXRIDE_PAYMENTS_ENABLED || "").trim());

export function paymentConfiguration() {
  const provider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  const secret = process.env.PAYMENT_SECRET_KEY || "";
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "";
  const enabled =
    enabledFlag() &&
    provider === "chapa" &&
    secret.length > 0 &&
    webhookSecret.length > 0;

  return { enabled, provider: enabled ? "chapa" as const : null };
}

function providerSecret() {
  const config = paymentConfiguration();
  if (!config.enabled) throw new Error("PAYMENTS_NOT_CONFIGURED");
  return process.env.PAYMENT_SECRET_KEY!;
}

type ChapaVerification = {
  status?: unknown;
  data?: {
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    tx_ref?: unknown;
    reference?: unknown;
  };
};

export async function initializeChapaPayment(input: {
  txRef: string;
  amount: number;
  email: string;
  firstName?: string;
  lastName?: string;
  returnUrl: string;
  callbackUrl: string;
}) {
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
      amount: input.amount.toFixed(2),
      currency: "ETB",
      email: input.email,
      first_name: input.firstName || "NexRide",
      last_name: input.lastName || "Rider",
      tx_ref: input.txRef,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      customization: {
        title: "NexRide trip payment",
        description: "NexRide completed ride",
      },
    }),
  });

  const payload = await response.json().catch(() => null) as {
    status?: unknown;
    message?: unknown;
    data?: { checkout_url?: unknown };
  } | null;

  const checkoutUrl =
    typeof payload?.data?.checkout_url === "string" &&
    /^https:///i.test(payload.data.checkout_url)
      ? payload.data.checkout_url
      : "";

  if (!response.ok || payload?.status !== "success" || !checkoutUrl)
    throw new Error("PAYMENT_INITIALIZATION_FAILED");

  return { checkoutUrl, providerPayload: payload };
}

export async function verifyChapaPayment(input: {
  txRef: string;
  amount: number;
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

  const payload = await response.json().catch(() => null) as ChapaVerification | null;
  const data = payload?.data;
  const amount = Number(data?.amount);
  const txRef = typeof data?.tx_ref === "string" ? data.tx_ref : "";
  const currency = typeof data?.currency === "string" ? data.currency : "";
  const status = typeof data?.status === "string" ? data.status.toLowerCase() : "";

  const verified =
    response.ok &&
    payload?.status === "success" &&
    status === "success" &&
    txRef === input.txRef &&
    currency === "ETB" &&
    Number.isFinite(amount) &&
    Math.abs(amount - input.amount) < 0.005;

  return {
    verified,
    reference: typeof data?.reference === "string" ? data.reference : null,
    providerPayload: payload,
  };
}

export function validChapaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(supplied, "hex"),
  );
}

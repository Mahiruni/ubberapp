import { createHmac, timingSafeEqual } from "node:crypto";

const CHAPA_API = "https://api.chapa.global/v2";
const active = (value?: string) => /^(1|true|yes|on)$/i.test((value || "").trim());

/** Test-mode by default. Live collection requires an explicit, separate merchant approval flag. */
export function paymentConfiguration() {
  const provider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  const secret = process.env.CHAPA_SECRET_KEY || process.env.PAYMENT_SECRET_KEY || "";
  const webhookSecret = process.env.CHAPA_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "";
  const mode = secret.startsWith("CHAPA_LIVE_") ? "live" : "test";
  const liveApproved = active(process.env.BILOO_LIVE_PAYMENTS_APPROVED);
  const sandboxAllowed = process.env.NODE_ENV !== "production" || active(process.env.BILOO_SANDBOX_CHECKOUT_ENABLED);\n  const keyValid = (secret.startsWith("CHAPA_TEST_") && sandboxAllowed) || (mode === "live" && liveApproved);
  const enabled =
    active(process.env.NEXRIDE_PAYMENTS_ENABLED) &&
    provider === "chapa" &&
    keyValid &&
    webhookSecret.length >= 16;
  return { enabled, provider: enabled ? ("chapa" as const) : null, mode: enabled ? mode : null };
}

function providerSecret() {
  if (!paymentConfiguration().enabled) throw new Error("PAYMENTS_NOT_CONFIGURED");
  return process.env.CHAPA_SECRET_KEY || process.env.PAYMENT_SECRET_KEY || "";
}

type ChapaResponse = {
  status?: unknown;
  data?: Record<string, unknown>;
};

function safeSummary(value: ChapaResponse | null) {
  const data = value?.data;
  return {
    status: typeof data?.status === "string" ? data.status : null,
    merchant_reference: typeof data?.merchant_reference === "string" ? data.merchant_reference : null,
    chapa_reference: typeof data?.chapa_reference === "string" ? data.chapa_reference : null,
    currency: typeof data?.currency === "string" ? data.currency : null,
    amount: typeof data?.amount === "number" || typeof data?.amount === "string" ? data.amount : null,
    payment_method: typeof data?.payment_method === "string" ? data.payment_method : null,
  };
}

const validMoney = (amount: number) => Number.isFinite(amount) && amount > 0 &&
  Number.isSafeInteger(Math.round(amount * 100)) &&
  Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;

export async function initializeChapaPayment(input: {
  txRef: string;
  amount: number;
  email: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  returnUrl: string;
  callbackUrl: string;
}) {
  if (!validMoney(input.amount)) throw new Error("INVALID_PAYMENT_AMOUNT");
  const customer: Record<string, string> = {
    first_name: input.firstName || "Biloo",
    last_name: input.lastName || "Rider",
    email: input.email,
  };
  if (input.phoneNumber && /^\+251\d{9}$/.test(input.phoneNumber)) {
    customer.phone_number = input.phoneNumber;
  }
  const response = await fetch(CHAPA_API + "/payments/hosted", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: "Bearer " + providerSecret(),
      "Content-Type": "application/json",
      Accept: "application/json",
      "Idempotency-Key": input.txRef,
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: "ETB",
      merchant_reference: input.txRef,
      customer,
      return_url: input.returnUrl,
      callback_url: input.callbackUrl,
      meta: { app: "biloo", purpose: "ride_payment" },
    }),
  });

  const payload = await response.json().catch(() => null) as ChapaResponse | null;
  const rawUrl = payload?.data?.checkout_url;
  let checkoutUrl = "";
  if (typeof rawUrl === "string") {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === "https:" &&
          (parsed.hostname === "chapa.co" || parsed.hostname.endsWith(".chapa.co") ||
           parsed.hostname === "chapa.global" || parsed.hostname.endsWith(".chapa.global"))) {
        checkoutUrl = parsed.toString();
      }
    } catch { /* invalid checkout location */ }
  }
  if (!response.ok || payload?.status !== "success" || !checkoutUrl)
    throw new Error("PAYMENT_INITIALIZATION_FAILED");

  return {
    checkoutUrl,
    reference: typeof payload?.data?.chapa_reference === "string" ? payload.data.chapa_reference : null,
    providerPayload: { status: "initialized", checkout_host: new URL(checkoutUrl).hostname },
  };
}

export type PaymentVerification = {
  verified: boolean;
  state: "paid" | "pending" | "failed" | "unverified";
  reference: string | null;
  providerPayload: ReturnType<typeof safeSummary> | null;
};

/** Chapa v2 verifies by Chapa's reference, NOT our merchant reference. */
export async function verifyChapaPayment(input: {
  txRef: string;
  amount: number;
  chapaReference?: string | null;
}): Promise<PaymentVerification> {
  const reference = input.chapaReference?.trim();
  if (!reference || !/^[a-zA-Z0-9_-]{4,160}$/.test(reference))
    return { verified: false, state: "unverified", reference: null, providerPayload: null };
  const response = await fetch(
    CHAPA_API + "/payments/" + encodeURIComponent(reference) + "/verify",
    {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + providerSecret(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => null) as ChapaResponse | null;
  const data = payload?.data;
  if (!response.ok || payload?.status !== "success" || !data)
    return { verified: false, state: "unverified", reference, providerPayload: safeSummary(payload) };
  const amount = typeof data.amount === "number" ? data.amount : Number(data.amount);
  const identityMatches =
    data.chapa_reference === reference &&
    data.merchant_reference === input.txRef &&
    data.currency === "ETB" &&
    validMoney(input.amount) &&
    Number.isFinite(amount) &&
    Math.abs(Math.round(amount * 100) - Math.round(input.amount * 100)) === 0;
  if (!identityMatches)
    return { verified: false, state: "unverified", reference, providerPayload: safeSummary(payload) };
  const status = typeof data.status === "string" ? data.status.toLowerCase() : "";
  const state = status === "success" ? "paid" :
    ["failed", "cancelled", "canceled", "incomplete", "blocked"].includes(status) ? "failed" : "pending";
  return {
    verified: state === "paid",
    state,
    reference,
    providerPayload: safeSummary(payload),
  };
}

export function validChapaWebhookSignature(rawBody: string, signature: string | null) {
  const secret = process.env.CHAPA_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret || !signature || !/^[a-f0-9]{64}$/i.test(signature.trim())) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(signature.trim(), "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

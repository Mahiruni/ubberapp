import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const CHAPA_API = "https://api.chapa.co/v1";

type JsonRecord = Record<string, unknown>;

export type PayoutBank = {
  code: string;
  name: string;
};

export type PayoutProviderState =
  | "paid"
  | "processing"
  | "failed"
  | "not_found";

const enabledFlag = () =>
  /^(1|true|yes|on)$/i.test(
    (process.env.NEXRIDE_PAYOUTS_ENABLED || "").trim(),
  );

export function payoutConfiguration() {
  const provider = (process.env.PAYMENT_PROVIDER || "").trim().toLowerCase();
  const providerSecret = process.env.PAYMENT_SECRET_KEY || "";
  const encryptionSecret = process.env.PAYOUT_ENCRYPTION_KEY || "";
  const enabled =
    enabledFlag() &&
    provider === "chapa" &&
    providerSecret.length > 0 &&
    encryptionSecret.length >= 24;

  return { enabled, provider: enabled ? ("chapa" as const) : null };
}

function chapaSecret() {
  if (!payoutConfiguration().enabled)
    throw new Error("PAYOUTS_NOT_CONFIGURED");
  return process.env.PAYMENT_SECRET_KEY!;
}

function encryptionKey() {
  const source = process.env.PAYOUT_ENCRYPTION_KEY || "";
  if (source.length < 24) throw new Error("PAYOUT_ENCRYPTION_NOT_CONFIGURED");
  return createHash("sha256").update(source, "utf8").digest();
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function providerSummary(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  return {
    status: text(root?.status) || null,
    message: text(root?.message) || null,
    transferStatus: text(data?.status) || null,
    reference:
      text(data?.reference) ||
      text(data?.tx_ref) ||
      (typeof root?.data === "string" ? root.data : null),
  };
}

export function normalizePayoutAccountNumber(value: unknown) {
  const compact = typeof value === "string" ? value.replace(/[\s-]+/g, "") : "";
  return /^\+?[0-9]{5,32}$/.test(compact) ? compact : "";
}

export function maskPayoutAccountNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  const tail = digits.slice(-4);
  return tail ? `•••• ${tail}` : "Saved account";
}

export function encryptPayoutAccountNumber(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptPayoutAccountNumber(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw)
    throw new Error("PAYOUT_ACCOUNT_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function bankRows(payload: unknown): JsonRecord[] {
  const root = asRecord(payload);
  const data = root?.data;
  if (Array.isArray(data)) return data.map(asRecord).filter(Boolean) as JsonRecord[];
  const nested = asRecord(data);
  if (Array.isArray(nested?.data))
    return nested.data.map(asRecord).filter(Boolean) as JsonRecord[];
  if (Array.isArray(root?.banks))
    return root.banks.map(asRecord).filter(Boolean) as JsonRecord[];
  return [];
}

export async function listChapaPayoutBanks(): Promise<PayoutBank[]> {
  const response = await fetch(CHAPA_API + "/banks", {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
    headers: {
      Authorization: "Bearer " + chapaSecret(),
      Accept: "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error("PAYOUT_BANKS_UNAVAILABLE");

  const unique = new Map<string, string>();
  for (const row of bankRows(payload)) {
    const codeValue =
      row.id ?? row.bank_code ?? row.code ?? row.slug ?? row.short_code;
    const code =
      typeof codeValue === "number" && Number.isFinite(codeValue)
        ? String(codeValue)
        : text(codeValue);
    const name =
      text(row.name) ||
      text(row.bank_name) ||
      text(row.title) ||
      text(row.slug);
    if (code && name && !unique.has(code)) unique.set(code, name);
  }

  return [...unique.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function initiateChapaPayout(input: {
  reference: string;
  amount: number;
  bankCode: string;
  accountName: string;
  accountNumber: string;
}) {
  const bankCode = /^\d+$/.test(input.bankCode)
    ? Number(input.bankCode)
    : input.bankCode;

  const response = await fetch(CHAPA_API + "/transfers", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: "Bearer " + chapaSecret(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      account_name: input.accountName,
      account_number: input.accountNumber,
      amount: input.amount.toFixed(2),
      currency: "ETB",
      reference: input.reference,
      bank_code: bankCode,
    }),
  });

  const payload = await response.json().catch(() => null);
  const root = asRecord(payload);
  const accepted = response.ok && text(root?.status).toLowerCase() === "success";

  return {
    accepted,
    definitiveFailure:
      !accepted &&
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 409 &&
      response.status !== 429,
    providerSummary: providerSummary(payload),
  };
}

export async function verifyChapaPayout(
  reference: string,
): Promise<{
  state: PayoutProviderState;
  providerSummary: ReturnType<typeof providerSummary>;
}> {
  const response = await fetch(
    CHAPA_API + "/transfers/verify/" + encodeURIComponent(reference),
    {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: "Bearer " + chapaSecret(),
        Accept: "application/json",
      },
    },
  );
  const payload = await response.json().catch(() => null);
  const summary = providerSummary(payload);

  if (response.status === 404)
    return { state: "not_found", providerSummary: summary };

  if (!response.ok)
    throw new Error("PAYOUT_VERIFICATION_UNAVAILABLE");

  const raw = (summary.transferStatus || "").toLowerCase();
  const state: PayoutProviderState =
    ["success", "successful", "completed", "paid"].includes(raw)
      ? "paid"
      : ["failed", "reversed", "reverted", "cancelled", "canceled"].includes(raw)
        ? "failed"
        : "processing";

  return { state, providerSummary: summary };
}

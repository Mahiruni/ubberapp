/** ETB has 100 santim. Never use floating point arithmetic for posting money. */
export function etbMinor(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) return null;
  const minor =
    Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function etbDecimal(minor: number): string {
  if (!Number.isSafeInteger(minor) || minor < 0) throw Error("INVALID_MONEY");
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

export function formatPayMoney(minor: number | null | undefined): string {
  if (minor == null || !Number.isSafeInteger(minor)) return "—";
  return new Intl.NumberFormat("en-ET", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

export const payUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const payIdempotencyKey = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{16,120}$/.test(value);

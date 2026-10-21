/** Biloo rider payment preferences are NOT a payment authorization. */
export const paymentMethods = [
  { id: "cash", name: "Cash", icon: "money", available: true },
  { id: "telebirr", name: "Telebirr", icon: "phone", available: false },
  { id: "cbe_birr", name: "CBE Birr", icon: "wallet", available: false },
  { id: "mpesa", name: "M-Pesa", icon: "phone", available: false },
  { id: "awashbirr", name: "AwashBirr", icon: "wallet", available: false },
  { id: "ebirr", name: "Coopay / E-Birr", icon: "wallet", available: false },
  { id: "bank_card", name: "Bank / Card", icon: "card", available: false },
] as const;
export type BilooMethod = (typeof paymentMethods)[number]["id"];
export function isBilooMethod(value: unknown): value is BilooMethod {
  return typeof value === "string" && paymentMethods.some(item => item.id === value);
}
export function paymentMethodName(id: unknown): string {
  return paymentMethods.find(item => item.id === id)?.name || "Unknown payment method";
}
export function isChargeableMethod(id: unknown): boolean {
  return id === "cash";
}
export type TripPaymentStatus = "paid" | "failed" | "pending" | "unknown" | string;
export function tripPaymentLabel(status: TripPaymentStatus, isCompleted: boolean): string {
  if (status === "paid") return "Recorded as paid";
  if (status === "failed") return "Payment failed";
  if (status === "pending") return isCompleted ? "Payment pending" : "Trip in progress";
  return "Payment status unconfirmed";
}
export function formatEtb(value: number | string | null | undefined): string {
  if (value == null || value === "") return "Not confirmed";
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return "Not confirmed";
  return "ETB " + new Intl.NumberFormat("en-ET", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number);
}

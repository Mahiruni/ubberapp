/** Ethiopian mobile numbers: 09…, 07…, 9…, 7…, or +2519…/+2517… */
export function normalizeEthiopianPhone(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (/^251[79][0-9]{8}$/.test(digits)) return "+" + digits;
  if (/^0[79][0-9]{8}$/.test(digits)) return "+251" + digits.slice(1);
  if (/^[79][0-9]{8}$/.test(digits)) return "+251" + digits;
  return null;
}
export const IDENTITY_DOCUMENT_TYPES = [
  { value: "fayda", label: "Fayda National ID" },
  { value: "passport", label: "Passport" },
  { value: "driver_license", label: "Driver's license" },
  { value: "other", label: "Other accepted ID" },
] as const;
export function identityDocumentLabel(key: string): string {
  return IDENTITY_DOCUMENT_TYPES.find(item => item.value === key)?.label || "Identity document";
}
export function identityDocumentReusable(status: string): boolean {
  return status === "approved" || status === "pending";
}

/** A Driver's primary role is preserved when their existing account also
 * has a server-authorized Rider membership. Admin identities are excluded. */
export function canReuseRiderAccount(primaryRole: string, riderMembership: boolean): boolean {
  return primaryRole === "rider" || (primaryRole === "driver" && riderMembership);
}

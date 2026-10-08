/** Validate the owning Driver's real private Storage evidence. */
export const MAX_DRIVER_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MIME = new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
export function isDriverDocumentPath(path: string, ownerId: string): boolean {
  if (!ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) return false;
  if (!path.startsWith(ownerId + "/") || path.length > 300) return false;
  const name = path.slice(ownerId.length + 1);
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}\.(?:jpg|jpeg|png|webp|pdf)$/i.test(name) &&
    !name.includes("..");
}
export function isDriverDocumentEvidence(
  info: { size?: number | null; contentType?: string | null } | null,
): boolean {
  return !!info && typeof info.size === "number" &&
    Number.isFinite(info.size) && info.size > 0 &&
    info.size <= MAX_DRIVER_DOCUMENT_BYTES &&
    MIME.has((info.contentType || "").toLowerCase().split(";")[0].trim());
}

/** Clean up only evidence created in the current upload attempt.
 * Existing verification evidence must never be included for deletion.
 */
export function unsubmittedDriverEvidencePaths(
  uploadedPaths: readonly string[],
  existingPaths: readonly string[],
): string[] {
  const existing = new Set(existingPaths.filter(Boolean));
  return [...new Set(uploadedPaths)].filter(path => Boolean(path) && !existing.has(path));
}

/** Remove sensitive ID numbers and unknown fields from older session drafts.
 * A document number is loaded only from the authenticated record when needed.
 */
export function sanitizeDriverVerificationDraft(raw: string): string {
  const original: unknown = JSON.parse(raw);
  const draft = original && typeof original === "object" ?
    original as Record<string, unknown> : {};
  const safe = (key: string, max: number) =>
    typeof draft[key] === "string" ? (draft[key] as string).slice(0, max) : "";
  return JSON.stringify({
    licenseExpiry: safe("licenseExpiry", 20),
    vehicle: safe("vehicle", 120),
    vehicleColor: safe("vehicleColor", 32),
    plate: safe("plate", 60),
  });
}

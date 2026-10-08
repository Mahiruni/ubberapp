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

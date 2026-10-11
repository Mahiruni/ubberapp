/** Validations shared by the Rider uploader and unit tests. */
export const RIDER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const RIDER_AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function riderAvatarValidation(
  file: Pick<File, 'size' | 'type'>,
): 'type' | 'size' | null {
  if (!Object.prototype.hasOwnProperty.call(RIDER_AVATAR_EXTENSIONS, file.type)) return 'type';
  if (!Number.isFinite(file.size) || file.size <= 0 ||
    file.size > RIDER_AVATAR_MAX_BYTES) return 'size';
  return null;
}

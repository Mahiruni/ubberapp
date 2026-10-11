/** Shared, device-side profile photo optimization for Rider and Driver.
 * User photographs stay local until the edited, compressed JPEG is ready.
 */
export const PHOTO_SOURCE_MAX_BYTES = 25 * 1024 * 1024;
export const PHOTO_OUTPUT_TARGET_BYTES = 350 * 1024;
export const PHOTO_CROP_SIZE = 512;

export function portraitCrop(width: number, height: number, zoom: number, x: number, y: number) {
  const side = Math.min(width, height) / zoom;
  return { side, x: (width - side) * (x + 100) / 200, y: (height - side) * (y + 100) / 200 };
}

export function photoSizeLabel(bytes: number) {
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob?.type === 'image/jpeg' && blob.size > 0
        ? resolve(blob)
        : reject(new Error('photo_compression_failed')), 'image/jpeg', quality);
    } catch {
      reject(new Error('photo_compression_failed'));
    }
  });
}

/** Prefer full-resolution/high-quality JPEG, lowering quality before pixels.
 * Output is capped at 350 KiB and much smaller than the 5 MB private-bucket limit.
 * Never upload an oversized fallback or silently discard the existing portrait.
 */
export async function compressPortraitCanvas(source: HTMLCanvasElement): Promise<Blob> {
  if (!source.width || !source.height) throw new Error('photo_compression_failed');
  for (const side of [PHOTO_CROP_SIZE, 448, 384, 320]) {
    const canvas = side === source.width && side === source.height
      ? source
      : document.createElement('canvas');
    if (canvas !== source) {
      canvas.width = side;
      canvas.height = side;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('photo_compression_failed');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, side, side);
    }
    for (const quality of [0.92, 0.86, 0.8, 0.73, 0.64]) {
      const blob = await encodeJpeg(canvas, quality);
      if (blob.size <= PHOTO_OUTPUT_TARGET_BYTES) return blob;
    }
  }
  throw new Error('photo_compression_failed');
}

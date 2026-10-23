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

/** Small separately stored WebP for 48–72px avatars. The high-quality master
 * remains private and is never downloaded just to render the menu portrait.
 * Browser-only: called when editing an image, not during navigation.
 */
export async function compressPortraitThumbnail(source: HTMLCanvasElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('thumbnail_compression_failed');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, 256, 256);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob && blob.size > 0 && blob.type === 'image/webp') resolve(blob);
      else reject(new Error('thumbnail_compression_failed'));
    }, 'image/webp', 0.84);
  });
}

/** Preserve a high-detail *cropped* master on capable devices, up to 3840px.
 * Never upscale a smaller photograph. Limit compressed files to 3 MiB so a
 * private Storage upload does not require transferring a massive raw 4K file.
 * Mobile browsers use a lower safe ceiling to avoid memory-related crashes.
 * The separately generated 256px WebP is still used for every menu avatar.
 */
export async function compressPortraitMaster(
  image: HTMLImageElement, zoom: number, x: number, y: number,
): Promise<Blob> {
  const crop = portraitCrop(image.naturalWidth, image.naturalHeight, zoom, x, y);
  const device = navigator as Navigator & { deviceMemory?: number };
  const memoryGB = device.deviceMemory ?? 4;
  const isTouch = window.matchMedia?.('(pointer:coarse)').matches ?? true;
  const safeLimit = isTouch ? (memoryGB >= 8 ? 3072 : 2048) : 3840;
  const maxSide = Math.min(safeLimit, 3840, Math.floor(crop.side));
  if (maxSide < PHOTO_CROP_SIZE) throw new Error('master_too_small');
  for (const side of [...new Set([maxSide, 2048, 1536, 1024, PHOTO_CROP_SIZE])].filter(n => n <= maxSide)) {
    const canvas = document.createElement('canvas');
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('master_canvas_unavailable');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, side, side);
    ctx.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, side, side);
    for (const quality of [0.90, 0.84, 0.76, 0.67]) {
      const blob = await encodeJpeg(canvas, quality);
      if (blob.size <= 3 * 1024 * 1024) return blob;
    }
  }
  throw new Error('master_compression_failed');
}

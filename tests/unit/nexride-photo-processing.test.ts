import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressPortraitCanvas, photoSizeLabel, portraitCrop, PHOTO_CROP_SIZE, PHOTO_OUTPUT_TARGET_BYTES, PHOTO_SOURCE_MAX_BYTES } from '../../lib/nexride-photo-processing';

afterEach(() => vi.unstubAllGlobals());

function fakeCanvas(sizes: number[]) {
  let index = 0;
  const qualities: number[] = [];
  const canvas = {
    width: PHOTO_CROP_SIZE,
    height: PHOTO_CROP_SIZE,
    toBlob: (callback: (blob: Blob | null) => void, mime: string, quality: number) => {
      qualities.push(quality);
      callback(new Blob([new Uint8Array(sizes[Math.min(index++, sizes.length - 1)])], { type: mime }));
    },
  } as unknown as HTMLCanvasElement;
  return { canvas, qualities };
}

describe('NexRide photo optimization', () => {
  it('keeps 512px JPEG at high quality when already small enough', async () => {
    const photo = fakeCanvas([100 * 1024]);
    const result = await compressPortraitCanvas(photo.canvas);
    expect(result.size).toBe(100 * 1024);
    expect(result.type).toBe('image/jpeg');
    expect(photo.qualities).toEqual([0.92]);
    expect(photoSizeLabel(result.size)).toBe('100 KB');
    expect(PHOTO_SOURCE_MAX_BYTES).toBe(25 * 1024 * 1024);
  });

  it('tries slightly lower JPEG quality before reducing dimensions', async () => {
    const photo = fakeCanvas([PHOTO_OUTPUT_TARGET_BYTES + 1, 220 * 1024]);
    const result = await compressPortraitCanvas(photo.canvas);
    expect(result.size).toBeLessThan(PHOTO_OUTPUT_TARGET_BYTES);
    expect(photo.qualities).toEqual([0.92, 0.86]);
  });

  it('reduces resolution only if the quality-first passes remain too large', async () => {
    const photo = fakeCanvas([PHOTO_OUTPUT_TARGET_BYTES + 100]);
    const resized = fakeCanvas([190 * 1024]);
    const ctx = { drawImage: vi.fn(), imageSmoothingEnabled: false, imageSmoothingQuality: 'low' };
    const output = Object.assign(resized.canvas, { getContext: () => ctx });
    vi.stubGlobal('document', { createElement: vi.fn(() => output) });
    const result = await compressPortraitCanvas(photo.canvas);
    expect(result.size).toBe(190 * 1024);
    expect((document.createElement as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('canvas');
    expect(output.width).toBe(448);
    expect(ctx.drawImage).toHaveBeenCalledWith(photo.canvas, 0, 0, 448, 448);
    expect(photo.qualities).toHaveLength(5);
  });

  it('never returns a non-JPEG or oversized file', async () => {
    const source = {
      width: PHOTO_CROP_SIZE, height: PHOTO_CROP_SIZE,
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(['abc'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement;
    await expect(compressPortraitCanvas(source)).rejects.toThrow('photo_compression_failed');
  });

  it('supports the same crop geometry for Rider and Driver', () => {
    expect(portraitCrop(1200, 800, 1, 0, 0)).toEqual({ side: 800, x: 200, y: 0 });
    expect(portraitCrop(800, 1200, 2, 100, -100)).toEqual({ side: 400, x: 400, y: 0 });
  });
});

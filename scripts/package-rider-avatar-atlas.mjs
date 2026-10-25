import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

// Split the generated collection into individual transparent WebP assets.
// Keep the largest connected silhouette in each cell so a neighboring
// character's shoes/hair at a cell boundary never leak into another avatar.
const source = process.argv[2] || 'assets/rider-avatars/collection-v2.png';
const pose = process.argv[3] === 'wave' ? 'wave-v1' : 'v2';
const output = 'public/avatars/rider';
const metadata = await sharp(source).metadata();
await mkdir(output, { recursive: true });

for (let preset = 0; preset < 20; preset++) {
  const col = preset % 4, row = Math.floor(preset / 4);
  const left = Math.round(col * metadata.width / 4);
  // In the waving atlas, the previous row's shoe touches character 14's
  // hair at the cell edge. Crop that six-pixel gutter before isolating it.
  const top = Math.round(row * metadata.height / 5) + (pose === 'wave-v1' && preset === 13 ? 6 : 0);
  const width = Math.round((col + 1) * metadata.width / 4) - left;
  const height = Math.round((row + 1) * metadata.height / 5) - top;
  const cell = await sharp(source).extract({ left, top, width, height }).png().toBuffer();
  const pixels = await sharp(cell).ensureAlpha().raw().toBuffer();
  const visited = new Uint8Array(width * height), queue = new Int32Array(width * height);
  let silhouette = new Int32Array();
  for (let p = 0; p < visited.length; p++) {
    if (visited[p] || pixels[p * 4 + 3] < 32) continue;
    let head = 0, tail = 1;
    queue[0] = p; visited[p] = 1;
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next >= 0 && !visited[next] && pixels[next * 4 + 3] >= 32) {
          visited[next] = 1; queue[tail++] = next;
        }
      }
    }
    if (tail > silhouette.length) silhouette = queue.slice(0, tail);
  }
  if (!silhouette.length) throw new Error(`Missing character ${preset + 1}`);
  // Retain two pixels of original alpha around the silhouette for hair strands
  // and antialiasing. Do not synthesize or replace any character pixels.
  const keep = new Uint8Array(width * height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (const index of silhouette) {
    const x = index % width, y = Math.floor(index / width);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height) keep[(y + dy) * width + x + dx] = 1;
    }
  }
  for (let p = 0; p < keep.length; p++) if (!keep[p]) pixels[p * 4 + 3] = 0;
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2);
  x1 = Math.min(width - 1, x1 + 2); y1 = Math.min(height - 1, y1 + 2);
  const isolated = await sharp(pixels, { raw: { width, height, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
  await sharp(isolated).resize(192, 320, { fit: 'contain', position: 'bottom', background: '#00000000' })
    .webp({ quality: 88, alphaQuality: 100, effort: 4 })
    .toFile(`${output}/character-${String(preset + 1).padStart(2, '0')}-${pose}.webp`);
}
console.log('Packaged 20 transparent Rider characters.');

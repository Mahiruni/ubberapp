import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const iconsDir = join(publicDir, "icons");
mkdirSync(iconsDir, { recursive: true });

const NAVY = [4, 28, 48, 255];
const MARKS = [
  { color: [32, 218, 147, 255], points: [[18,106],[35,24],[61,24],[42.5,105],[33,113],[24,113]] },
  { color: [0, 185, 120, 255], points: [[45,15],[58,23],[102,99.5],[94,113],[81,113],[39.5,37.5]] },
  { color: [0, 216, 137, 255], points: [[79,101],[96,24],[121,21.7],[103.5,103.4],[92.7,113]] },
];

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, size, radius) {
  if (x >= radius && x <= size - radius) return y >= 0 && y <= size;
  if (y >= radius && y <= size - radius) return x >= 0 && x <= size;
  const cx = x < radius ? radius : size - radius;
  const cy = y < radius ? radius : size - radius;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function sample(size, px, py, options) {
  const transparentCorners = options.transparentCorners === true;
  if (transparentCorners && !inRoundedRect(px, py, size, size * 0.24)) return [0,0,0,0];

  const safe = options.safe;
  const markSize = size * safe;
  const ox = (size - markSize) / 2;
  const oy = (size - markSize) / 2;
  const nx = ((px - ox) / markSize) * 128;
  const ny = ((py - oy) / markSize) * 128;

  for (let i = MARKS.length - 1; i >= 0; i--) {
    if (pointInPolygon(nx, ny, MARKS[i].points)) return MARKS[i].color;
  }
  return NAVY;
}

function renderRgba(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = [[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sum = [0,0,0,0];
      for (const [sx, sy] of samples) {
        const c = sample(size, x + sx, y + sy, options);
        for (let k = 0; k < 4; k++) sum[k] += c[k];
      }
      const i = (y * size + x) * 4;
      for (let k = 0; k < 4; k++) pixels[i+k] = Math.round(sum[k] / samples.length);
    }
  }
  return pixels;
}

function png(size, options) {
  const pixels = renderRgba(size, options);
  const scan = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    scan[row] = 0;
    pixels.copy(scan, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(scan, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function dibIcon(size) {
  const rgba = renderRgba(size, { safe: 0.62, transparentCorners: true });
  const andStride = Math.ceil(size / 32) * 4;
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(size * size * 4, 20);
  const bitmap = Buffer.alloc(size * size * 4 + andStride * size);
  let o = 0;
  for (let y = size - 1; y >= 0; y--) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      bitmap[o++] = rgba[i + 2];
      bitmap[o++] = rgba[i + 1];
      bitmap[o++] = rgba[i];
      bitmap[o++] = rgba[i + 3];
    }
  }
  return Buffer.concat([header, bitmap]);
}

function ico(sizes) {
  const images = sizes.map(dibIcon);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach((image, index) => {
    const size = sizes[index];
    const e = index * 16;
    entries[e] = size === 256 ? 0 : size;
    entries[e + 1] = size === 256 ? 0 : size;
    entries[e + 2] = 0;
    entries[e + 3] = 0;
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(image.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += image.length;
  });
  return Buffer.concat([header, entries, ...images]);
}

for (const size of [72,96,128,144,152,192,384,512]) {
  writeFileSync(join(iconsDir, "icon-" + size + ".png"), png(size, { safe: 0.62 }));
}
for (const size of [192,384,512]) {
  writeFileSync(join(iconsDir, "icon-maskable-" + size + ".png"), png(size, { safe: 0.52 }));
}
for (const size of [16,32,48]) {
  writeFileSync(join(publicDir, "favicon-" + size + "x" + size + ".png"), png(size, { safe: 0.62, transparentCorners: true }));
}
writeFileSync(join(publicDir, "apple-touch-icon.png"), png(180, { safe: 0.62 }));
writeFileSync(join(publicDir, "favicon.ico"), ico([16,32,48]));
console.log("Generated NexRide favicon, Apple touch, standard PWA, and maskable icon assets.");

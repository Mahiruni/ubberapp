/**
 * NexRide role-specific icon pipeline.
 * The assets below are the actual approved Rider / Driver artworks.
 * Generate PNG and ICO sizes on install/build for Chrome, Android and iOS.
 * Never overwrite the Driver icon with the Rider mark.
 */
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const iconsDir = join(publicDir, "icons");
mkdirSync(iconsDir, { recursive: true });
const roles = {
  rider: join(iconsDir, "nexride-rider.webp"),
  driver: join(iconsDir, "nexride-driver.webp"),
};
const sizes = [16, 32, 36, 48, 72, 96, 128, 144, 152, 180, 192, 384, 512];

async function iconImage(source, size) {
  return sharp(source).resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 }).toBuffer();
}
async function paddedIcon(source, size, coverage = 0.75) {
  const inner = Math.round(size * coverage);
  const resized = await sharp(source).resize(inner, inner, { fit: "fill" }).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4,
      background: { r: 4, g: 28, b: 48, alpha: 1 } },
  }).composite([{ input: resized, left: Math.floor((size - inner) / 2),
    top: Math.floor((size - inner) / 2) }]).png({ compressionLevel: 9 }).toBuffer();
}
function windowsIcon(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const records = Buffer.alloc(images.length * 16);
  let offset = 6 + records.length;
  for (const [i, { size, data }] of images.entries()) {
    const p = i * 16;
    records[p] = size;
    records[p + 1] = size;
    records.writeUInt16LE(1, p + 4);
    records.writeUInt16LE(32, p + 6);
    records.writeUInt32LE(data.length, p + 8);
    records.writeUInt32LE(offset, p + 12);
    offset += data.length;
  }
  return Buffer.concat([header, records, ...images.map(x => x.data)]);
}
for (const [role, source] of Object.entries(roles)) {
  const driver = role === "driver";
  const prefix = driver ? "driver-icon-" : "icon-";
  const maskPrefix = driver ? "driver-icon-maskable-" : "icon-maskable-";
  for (const size of sizes) {
    writeFileSync(join(iconsDir, prefix + size + ".png"), await iconImage(source, size));
  }
  for (const size of [192, 384, 512]) {
    writeFileSync(join(iconsDir, maskPrefix + size + ".png"),
      await paddedIcon(source, size, 0.72));
  }
  // 108dp adaptive foreground per screen-density unit. Keep original dark
  // symbol inside the adaptive-icon safe area to prevent launcher clipping.
  for (const size of [108, 162, 216, 324, 432]) {
    writeFileSync(join(iconsDir, role + "-adaptive-" + size + ".png"),
      await paddedIcon(source, size, 0.65));
  }
  const faviconImages = [];
  for (const size of [16, 32, 48]) {
    const data = await iconImage(source, size);
    writeFileSync(join(publicDir,
      driver ? "driver-favicon-" + size + "x" + size + ".png"
        : "favicon-" + size + "x" + size + ".png"), data);
    faviconImages.push({ size, data });
  }
  writeFileSync(join(publicDir, driver ? "driver-favicon.ico" : "favicon.ico"),
    windowsIcon(faviconImages));
  writeFileSync(join(publicDir,
    driver ? "driver-apple-touch-icon.png" : "apple-touch-icon.png"),
    await iconImage(source, 180));
  const embedded = readFileSync(source).toString("base64");
  writeFileSync(join(publicDir, driver ? "driver-favicon.svg" : "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><image width="192" height="192" href="data:image/webp;base64,${embedded}"/></svg>\n`);
}
console.log("Generated matching NexRide Rider / Driver icons, favicons, adaptive Android and PWA assets.");

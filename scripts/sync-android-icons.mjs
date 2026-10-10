/**
 * Apply each app's own launcher image after Capacitor creates Android.
 * Run: node scripts/sync-android-icons.mjs rider|driver
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const role = process.argv[2];
if (!["rider", "driver"].includes(role)) {
  throw new Error("Expected NexRide role: rider or driver");
}
const res = join(root, "android", "app", "src", "main", "res");
const iconDir = join(root, "public", "icons");
if (!existsSync(res)) throw new Error("Android project not yet generated");
const prefix = role === "driver" ? "driver-icon-" : "icon-";
for (const [density, size, adaptive] of [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
]) {
  const dir = join(res, "mipmap-" + density);
  mkdirSync(dir, { recursive: true });
  const src = join(iconDir, prefix + size + ".png");
  const fg = join(iconDir, role + "-adaptive-" + adaptive + ".png");
  if (!existsSync(src) || !existsSync(fg))
    throw new Error("Missing generated " + role + " launcher asset " + density);
  copyFileSync(src, join(dir, "ic_launcher.png"));
  copyFileSync(src, join(dir, "ic_launcher_round.png"));
  copyFileSync(fg, join(dir, "ic_launcher_foreground.png"));
}
const values = join(res, "values");
mkdirSync(values, { recursive: true });
const colors = join(values, "colors.xml");
let xml = existsSync(colors) ? readFileSync(colors, "utf8") : "<resources></resources>";
if (/<color name="ic_launcher_background">[^<]*<\/color>/.test(xml)) {
  xml = xml.replace(/<color name="ic_launcher_background">[^<]*<\/color>/,
    '<color name="ic_launcher_background">#041C30</color>');
} else {
  xml = xml.replace("</resources>",
    '    <color name="ic_launcher_background">#041C30</color>\n</resources>');
}
writeFileSync(colors, xml);
console.log("Android launcher updated for " + role + " with separate icon and adaptive foreground.");

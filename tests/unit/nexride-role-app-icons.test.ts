import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const manifest = (name: string) => JSON.parse(
  readFileSync(join(root, "public", name), "utf8")
);

describe("Biloo independently installed Rider / Driver branding", () => {
  const rider = manifest("manifest.webmanifest");
  const driver = manifest("driver.webmanifest");

  it("uses distinct PWA identities, home routes and user-visible names", () => {
    expect(rider.id).toBe("/");
    expect(driver.id).toBe("/driver");
    expect(rider.start_url).toBe("/");
    expect(driver.start_url).toBe("/driver");
    expect(rider.name).toBe("Biloo Rider");
    expect(driver.name).toBe("Biloo Driver");
  });

  it("gives each application its own valid launcher icon resource", () => {
    const riderIcon = rider.icons.find((icon: { sizes: string; purpose: string }) =>
      icon.sizes === "192x192" && icon.purpose === "any");
    const driverIcon = driver.icons.find((icon: { sizes: string; purpose: string }) =>
      icon.sizes === "192x192" && icon.purpose === "any");
    expect(riderIcon.src).toBe("/icons/icon-192.png");
    expect(driverIcon.src).toBe("/icons/driver-icon-192.png");
    const a = readFileSync(join(root, "public", riderIcon.src));
    const b = readFileSync(join(root, "public", driverIcon.src));
    expect(a.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(b.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    // Approved artwork may match; separate app identities and paths still matter.
  });

  it("generates each role's icons from that role's artwork", async () => {
    const isolated = mkdtempSync(join(tmpdir(), "biloo-icon-pipeline-"));
    try {
      mkdirSync(join(isolated, "scripts"), { recursive: true });
      mkdirSync(join(isolated, "public/brand"), { recursive: true });
      symlinkSync(join(root, "node_modules"), join(isolated, "node_modules"), "junction");
      copyFileSync(join(root, "scripts/generate-brand-assets.mjs"), join(isolated, "scripts/generate-brand-assets.mjs"));
      for (const [role, color] of [["rider", "#123456"], ["driver", "#abcdef"]]) {
        writeFileSync(join(isolated, "public/brand", `biloo-${role}.svg`),
          `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="${color}"/></svg>`);
      }
      execFileSync(process.execPath, [join(isolated, "scripts/generate-brand-assets.mjs")], { timeout: 30000, stdio: "pipe" });
      for (const [role, rgb] of [["rider", [18, 52, 86]], ["driver", [171, 205, 239]]] as const) {
        const prefix = role === "rider" ? "icon-" : "driver-icon-";
        for (const filename of [`${prefix}192.png`, `${prefix}maskable-192.png`, `${role}-adaptive-108.png`]) {
          const { data, info } = await sharp(join(isolated, "public/icons", filename)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
          expect([...data.subarray(offset, offset + 3)]).toEqual([...rgb]);
        }
      }
    } finally {
      rmSync(isolated, { recursive: true, force: true });
    }
  }, 40000);

  it("produces full-resolution and safe-zone maskable assets for both", () => {
    for (const role of ["rider", "driver"]) {
      const prefix = role === "driver" ? "driver-icon-" : "icon-";
      const mask = role === "driver" ? "driver-icon-maskable-" : "icon-maskable-";
      for (const size of [72, 96, 192, 384, 512])
        expect(existsSync(join(root, "public/icons", prefix + size + ".png"))).toBe(true);
      for (const size of [192, 384, 512])
        expect(existsSync(join(root, "public/icons", mask + size + ".png"))).toBe(true);
      for (const size of [108, 162, 216, 324, 432])
        expect(existsSync(join(root, "public/icons",
          role + "-adaptive-" + size + ".png"))).toBe(true);
    }
  });
});

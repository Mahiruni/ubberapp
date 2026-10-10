import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = (name: string) => JSON.parse(
  readFileSync(join(root, "public", name), "utf8")
);

describe("NexRide independently installed Rider / Driver branding", () => {
  const rider = manifest("manifest.webmanifest");
  const driver = manifest("driver.webmanifest");

  it("uses distinct PWA identities, home routes and user-visible names", () => {
    expect(rider.id).toBe("/");
    expect(driver.id).toBe("/driver");
    expect(rider.start_url).toBe("/");
    expect(driver.start_url).toBe("/driver");
    expect(rider.name).toBe("NexRide Rider");
    expect(driver.name).toBe("NexRide Driver");
  });

  it("never shares the two applications' launcher icon files", () => {
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
    expect(a.equals(b)).toBe(false);
  });

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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Biloo navigation and image-performance safeguards", () => {
  it("never stores personalized navigation HTML in the PWA cache", () => {
    const sw = read("../../public/sw.js");
    const navigation = sw.split('if (request.mode === "navigate") {')[1]?.split("const cacheable =")[0];
    expect(navigation).toBeDefined();
    expect(navigation).not.toContain("cache.put(");
    expect(sw).toContain('url.pathname.startsWith("/_next/static/")');
  });

  it("keeps the approved welcome images high-priority and lightweight", () => {
    const rider = read("../../app/rider/page.tsx");
    const driver = read("../../app/driver/page.tsx");
    expect(rider).toContain('src="/brand/biloo-rider-get-started.jpg"');
    expect(driver).toContain('src="/brand/biloo-driver-get-started.webp"');
    expect(rider).toContain('fetchPriority="high"');
    expect(driver).toContain('fetchPriority="high"');
  });

  it("keeps the same account portrait in exactly one drawer location per role", () => {
    const riderMenu = read("../../components/nexride/rider-menu.tsx");
    const driverMenu = read("../../components/nexride/driver-app-shell.tsx");
    const riderHome = read("../../app/page.tsx");
    const driverHome = read("../../components/nexride/driver.tsx");
    const shared = read("../../lib/nexride-shared-portrait.ts");
    expect(riderMenu.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(driverMenu.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(riderMenu).toContain("useSharedAccountPortrait()");
    expect(driverMenu).toContain("useSharedAccountPortrait()");
    expect(riderHome).not.toContain('className="biloo-home-floating-profile"');
    expect(riderHome).not.toContain('className="nr-rider-profile-top"');
    expect(driverHome).not.toContain('className="nr-driver-home-profile"');
    expect(driverMenu).not.toContain('className="nr-driver-header-profile"');
    expect(shared).toContain("SIGNED_OUT");
    expect(shared).toContain("warmImage(next.url)");
  });

  it("uploads a separate tiny WebP and retains private source and legacy approval records", () => {
    const account = read("../../lib/nexride-account.ts");
    const photo = read("../../lib/nexride-photo-processing.ts");
    const rider = read("../../components/nexride/rider-photo-editor.tsx");
    const driver = read("../../components/nexride/driver-photo-manager.tsx");
    expect(account).toContain("thumbnailPath");
    expect(account).toContain("avatar_path: avatarPath");
    expect(account).toContain("driver_profile_photos");
    expect(account).toContain("nexride-driver-photos");
    expect(photo).toContain("compressPortraitThumbnail");
    expect(photo).toContain("canvas.width = 256");
    expect(photo).toContain("compressPortraitMaster");
    expect(photo).toContain("safeLimit");
    expect(photo).toContain("3840");
    expect(rider).toContain("compressPortraitThumbnail(canvas)");
    expect(rider).toContain("compressPortraitMaster");
    expect(driver).toContain("compressPortraitMaster");
    expect(driver).toContain("uploadRiderAvatar(account,");
  });

  it("does not use full document navigation in Rider tab handlers", () => {
    const root = read("../../app/page.tsx");
    const drawer = read("../../components/nexride/rider-menu.tsx");
    expect(root).not.toContain("window.location.assign(");
    expect(drawer).not.toContain("window.location.assign(");
  });
});

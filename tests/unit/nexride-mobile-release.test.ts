import { describe, expect, it } from "vitest";
import { decideMobileRelease, nativeRoleFromPackage, parseMobileRelease, validBuild } from "../../lib/nexride-mobile-release";

const release = {
  role: "driver", platform: "android", minimumBuild: 3, latestBuild: 4, webRevision: "commit2",
  storeUrl: "https://play.google.com/store/apps/details?id=com.nexride.driver",
};

describe("NexRide Android release policy", () => {
  it("identifies distinct native packages without guessing a role", () => {
    expect(nativeRoleFromPackage("com.nexride.driver")).toBe("driver");
    expect(nativeRoleFromPackage("com.nexride.rider")).toBe("rider");
    expect(nativeRoleFromPackage("com.example.other")).toBe(null);
  });
  it("rejects unsafe or malformed release policies", () => {
    expect(parseMobileRelease({ ...release, storeUrl: "https://other.example/update.apk" }, "driver")).toBeNull();
    expect(parseMobileRelease({ ...release, role: "rider" }, "driver")).toBeNull();
    expect(parseMobileRelease({ ...release, latestBuild: 2 }, "driver")).toBeNull();
    expect(parseMobileRelease({ ...release, minimumBuild: 0 }, "driver")).toBeNull();
  });
  it("separates web refreshes from mandatory Android installs", () => {
    const parsed = parseMobileRelease(release, "driver")!;
    expect(decideMobileRelease(parsed, 2, "commit2")).toBe("native-update");
    expect(decideMobileRelease(parsed, 3, "commit2")).toBe("current");
    expect(decideMobileRelease(parsed, 4, "commit1")).toBe("web-refresh");
    expect(decideMobileRelease(parsed, 4, null)).toBe("current");
  });
  it("validates Android version codes", () => {
    expect(validBuild("1")).toBe(1);
    expect(validBuild("0")).toBeNull();
    expect(validBuild("-1")).toBeNull();
    expect(validBuild("1.2")).toBeNull();
    expect(validBuild(Number.MAX_SAFE_INTEGER + 1)).toBeNull();
  });
});

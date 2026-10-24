import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nexrideSafeParentPath } from "../../lib/nexride-native-navigation";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const rider = JSON.parse(read("public/manifest.webmanifest"));
const driver = JSON.parse(read("public/driver.webmanifest"));
const bridge = read("components/nexride/native-navigation-bridge.tsx");
const location = read("lib/nexride-location.ts");
const sw = read("public/sw.js");

describe("Biloo Android/PWA foundations", () => {
  it("keeps Android bars visible in both installable Rider and Driver PWAs", () => {
    for (const [manifest, start] of [[rider, "/"], [driver, "/driver"]] as const) {
      expect(manifest.display).toBe("standalone");
      expect(manifest.display_override).not.toContain("fullscreen");
      expect(manifest.start_url).toBe(start);
      expect(manifest.orientation).toBe("any");
      expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(true);
    }
    expect(read("app/layout.tsx")).toContain('viewportFit: "cover"');
  });

  it("consumes Android Back once without a double-press trap or changing trip status", () => {
    expect(bridge).toContain('App.addListener("backButton"');
    expect(bridge).toContain("closeTopOverlay() || consumeNexRideBackHandlers()");
    expect(bridge).toContain("nextRouter.replace(parent)");
    expect(bridge).toContain("App.minimizeApp()");
    expect(bridge).not.toContain("Press Back again to minimize");
    expect(bridge).not.toContain("exitAt.current");
    expect(nexrideSafeParentPath("/driver/profile/settings")).toBe("/driver/profile");
    expect(nexrideSafeParentPath("/driver/navigation")).toBe("/driver/home");
    expect(nexrideSafeParentPath("/driver/home")).toBeNull();
  });

  it("pauses the foreground GPS watcher on background and reconnects on resume", () => {
    expect(bridge).toContain('App.addListener("appStateChange"');
    expect(bridge).toContain('"biloo:native-resume"');
    expect(bridge).toContain('"biloo:native-pause"');
    for (const signal of ["visibilitychange", "pagehide", "pageshow", "biloo:native-pause", "biloo:native-resume"]) {
      expect(location).toContain('addEventListener("' + signal + '"');
      expect(location).toContain('removeEventListener("' + signal + '"');
    }
    expect(location).toContain('if (document.visibilityState !== "hidden") startWatch(false)');
    expect(location).toContain('if (permission?.state === "denied")');
    expect(location).toContain("clearWatch()");
    expect(location).toContain("startWatch(false)");
    expect(location).toContain("latest.current = next");
  });

  it("prevents external, protocol-relative and malformed notification destinations", () => {
    const url = runInNewContext(sw + "\nbilooNotificationDestination;", {
      self: {
        location: { origin: "https://ubberapp.vercel.app" },
        addEventListener: () => {},
      },
      URL,
    }) as (input: unknown) => string;
    expect(url("/driver/request?offer=abc")).toBe("/driver/request?offer=abc");
    expect(url("/rider/trips")).toBe("/rider/trips");
    expect(url("/safety?role=driver#help")).toBe("/safety?role=driver#help");
    for (const unsafe of [
      "//evil.example/path",
      "/\\evil.example/",
      "https://evil.example/",
      "javascript:alert(1)",
      "data:text/html,hello",
      "file:///sdcard",
      "",
      null,
      "/abc\nLocation:evil",
    ]) {
      expect(url(unsafe)).toBe("/");
    }
    expect(sw).toContain('url.origin !== self.location.origin');
    expect(sw).toContain('const safePath = bilooNotificationDestination(event.notification.data?.url)');
    expect(sw).toContain('request.mode === "navigate"');
  });
});

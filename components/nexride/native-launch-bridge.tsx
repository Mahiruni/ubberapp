"use client";

import { useEffect, useState } from "react";
import { watchLaunchContent } from "../../lib/nexride-launch-handoff";

/** Single native-only branded launch. Never replay on route changes or resume. */
export function NexRideNativeLaunchBridge() {
  const [launch, setLaunch] = useState<{ version: string } | null>(null);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const [{ Capacitor }, { SplashScreen }, { App }] = await Promise.all([
        import("@capacitor/core"), import("@capacitor/splash-screen"), import("@capacitor/app"),
      ]);
      if (disposed || Capacitor.getPlatform() !== "android") return;
      const info = await App.getInfo().catch(() => null);
      if (disposed) return;
      setLaunch({ version: info?.version || "1.0.0" });
      stop = watchLaunchContent(document.body, () => {
        void SplashScreen.hide({ fadeOutDuration: 160 }).catch(() => {});
      });
      // Bounded branded launch; native splash must not cover the permission dialog.
      timer = setTimeout(() => {
        if (disposed) return;
        void SplashScreen.hide({ fadeOutDuration: 160 }).catch(() => {});
        setLaunch(null);
        // Android owns the Allow / Don't allow dialog. Request only if not decided.
        // Never block navigation if notifications are declined or unavailable.
        void (async () => {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const permission = await PushNotifications.checkPermissions();
          if (permission.receive !== "prompt" && permission.receive !== "prompt-with-rationale") return;
          const role = info?.id === "com.nexride.driver" ? "driver"
            : info?.id === "com.nexride.rider" ? "rider" : null;
          if (!role) return;
          const { enableNexRideNativeNotifications } = await import("../../lib/nexride-native-reliability");
          await enableNexRideNativeNotifications(role);
        })().catch(() => {});
      }, 1400);
    })().catch(() => {
      // Capacitor's bounded auto-hide remains the fallback.
    });
    return () => {
      disposed = true;
      stop?.();
      if (timer) clearTimeout(timer);
    };
  }, []);
  if (!launch) return null;
  return (
    <div role="status" aria-label="Biloo is starting" style={{
      position: "fixed", inset: 0, zIndex: 2147483646,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "space-between", padding: "max(28px, env(safe-area-inset-top)) 24px max(34px, env(safe-area-inset-bottom))",
      background: "linear-gradient(155deg, #f7faff 0%, #e9f0fc 55%, #ffffff 100%)",
      color: "#12366b", fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div style={{ textAlign: "center", fontSize: 11, letterSpacing: "0.14em", fontWeight: 700 }}>
        BILOO MOBILITY
        <div style={{ marginTop: 6, fontSize: 10, letterSpacing: "0.04em", fontWeight: 400 }}>Version {launch.version}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ width: 84, height: 84, borderRadius: 24, background: "#12366b", color: "#fff", display: "grid", placeItems: "center", fontSize: 48, fontWeight: 800 }}>B</div>
        <div style={{ fontSize: 35, fontWeight: 800, letterSpacing: "-0.05em" }}>Biloo</div>
        <div aria-hidden="true" style={{ width: 28, height: 28, border: "3px solid #cbd8ec", borderTopColor: "#12366b", borderRadius: "50%", animation: "biloo-launch-spin 0.85s linear infinite" }} />
        <span style={{ fontSize: 12, color: "#65758c" }}>Preparing your experience</span>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, lineHeight: 1.8, color: "#65758c" }}>
        App developed by
        <div style={{ color: "#12366b", fontSize: 12, fontWeight: 700 }}>Hisab Technologies PLC</div>
      </div>
      <style>{`@keyframes biloo-launch-spin { to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { [aria-label="Biloo is starting"] [aria-hidden="true"] { animation: none !important; } }`}</style>
    </div>
  );
}

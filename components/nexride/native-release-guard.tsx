"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  isAcceptedNexRideNativeRelease,
  type NexRideNativeReleaseIdentity,
} from "../../lib/nexride-release-policy";

type ReleasePlugin = {
  getReleaseIdentity(): Promise<NexRideNativeReleaseIdentity>;
};

/**
 * Retires original Capacitor wrappers without impacting the normal web/PWA
 * experience. This is a product-level compatibility gate, not an API security
 * boundary: backend permissions must independently protect customer data.
 */
export function NexRideNativeReleaseGuard({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "accepted" | "retired">(
    process.env.NEXT_PUBLIC_NEXRIDE_RETIRE_LEGACY_ANDROID === "true" ? "checking" : "accepted",
  );

  useEffect(() => {
    // Rollout switch stays disabled until both production-signed APKs
    // are published and verified. Enable via the production Vercel build env.
    if (process.env.NEXT_PUBLIC_NEXRIDE_RETIRE_LEGACY_ANDROID !== "true") {
      setStatus("accepted");
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (next: "accepted" | "retired") => {
      if (active) setStatus(next);
    };
    void (async () => {
      try {
        const { Capacitor, registerPlugin } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
          settle("accepted");
          return;
        }
        // Fail closed for Android wrappers missing the new native bridge.
        const bridge = registerPlugin<ReleasePlugin>("NexRideReleaseIdentity");
        const identity = await Promise.race([
          bridge.getReleaseIdentity(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("release identity timeout")), 3500);
          }),
        ]);
        settle(isAcceptedNexRideNativeRelease(identity) ? "accepted" : "retired");
      } catch {
        settle("retired");
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (status === "accepted") return <>{children}</>;

  return (
    <main style={{
      minHeight: "100dvh", display: "grid", placeItems: "center",
      padding: "max(30px, env(safe-area-inset-top)) 24px max(30px, env(safe-area-inset-bottom))",
      background: "#041C30", color: "#FFFFFF", fontFamily: "Inter, sans-serif",
    }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <p style={{ fontSize: 25, fontWeight: 800, letterSpacing: "-0.05em",
          margin: "0 0 20px" }}>Nex<span style={{ color: "#00C878" }}>Ride</span></p>
        {status === "checking" ? (
          <p role="status" style={{ fontSize: 16, lineHeight: 1.6 }}>
            Checking app security…
          </p>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 750, margin: "0 0 14px" }}>
              This version has been retired
            </h1>
            <p role="alert" style={{ fontSize: 16, lineHeight: 1.65,
              color: "#D2DEE5", marginBottom: 16 }}>
              For your safety, this NexRide Android app can no longer be used.
              Remove this copy and install the latest official NexRide Rider
              or Driver APK. Your NexRide account and cloud data remain unchanged.
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "#B7C7D0" }}>
              ለደህንነትዎ ይህ የNexRide ስሪት ተቋርጧል። አዲሱን መተግበሪያ ይጫኑ።
            </p>
          </>
        )}
      </div>
    </main>
  );
}

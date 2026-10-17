"use client";

import { useEffect } from "react";
import { watchLaunchContent } from "../../lib/nexride-launch-handoff";

/** Root-only handoff: never show or replay a splash during navigation/resume. */
export function NexRideNativeLaunchBridge() {
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    void Promise.all([import("@capacitor/core"), import("@capacitor/splash-screen")])
      .then(([{ Capacitor }, { SplashScreen }]) => {
        if (disposed || Capacitor.getPlatform() !== "android") return;
        stop = watchLaunchContent(document.body, () => {
          void SplashScreen.hide({ fadeOutDuration: 160 }).catch(() => {});
        });
      }).catch(() => {
        // Native launchAutoHide is a bounded fallback if JS/plugin loading fails.
      });
    return () => { disposed = true; stop?.(); };
  }, []);
  return null;
}

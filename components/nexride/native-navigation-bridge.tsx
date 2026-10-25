"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  consumeNexRideBackHandlers,
  nexrideSafeParentPath,
} from "../../lib/nexride-native-navigation";

function closeTopOverlay(): boolean {
  // Normally Android dismisses its own IME before delivering Back. If an
  // embedded WebView does deliver the event, blur the field before closing
  // a dialog or cancelling any operation.
  const focused = document.activeElement;
  if (focused instanceof HTMLElement &&
    focused.matches("input, textarea, select, [contenteditable='true']")) {
    focused.blur();
    return true;
  }
  const modal = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")]
    .filter(node => node.getClientRects().length).at(-1);
  if (modal) {
    // Use the component's React close action rather than removing the DOM node.
    const close = modal.querySelector<HTMLButtonElement>(
      ".nr-dialog-head button, [data-dialog-close], button[aria-label='Close'], button[aria-label='Close dialog']"
    );
    if (close) close.click();
    else modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  }
  // Native Back must dismiss an active accessible sheet before navigating away.
  // Only target overlays with an explicit dismiss control; never silently
  // hide a booking or payment sheet and leave React state out of sync.
  const sheet = [...document.querySelectorAll<HTMLElement>(
    '[role="dialog"][aria-modal="true"]:not(dialog), [data-biloo-sheet-open="true"]'
  )].filter(node => node.getClientRects().length).at(-1);
  if (sheet) {
    const close = sheet.querySelector<HTMLButtonElement>(
      '[data-sheet-close], [data-dialog-close], button[aria-label="Close"], button[aria-label="Dismiss"], button[aria-label="Back"]'
    );
    if (close) { close.click(); return true; }
  }
  const drawer = document.querySelector<HTMLElement>(".nr-driver-menu-layer, .nr-rider-drawer-layer");
  if (drawer) {
    drawer.querySelector<HTMLButtonElement>(".nr-driver-menu-close, .nr-rider-drawer-close")?.click();
    return true;
  }
  return false;
}

/** Mounted once, never once per screen: one Android event equals one action. */
export function NexRideNativeNavigationBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const current = useRef({ pathname, router });
  current.current = { pathname, router };
  const [notice, setNotice] = useState("");
  const lastBackAt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let removers: Array<() => Promise<void>> = [];
    let clearNotice: number | undefined;

    const showNotice = (message: string) => {
      setNotice(message);
      if (clearNotice) window.clearTimeout(clearNotice);
      clearNotice = window.setTimeout(() => setNotice(""), 2600);
    };

    void Promise.all([import("@capacitor/core"), import("@capacitor/app")]).then(
      async ([{ Capacitor }, { App }]) => {
        if (disposed || !Capacitor.isNativePlatform()) return;
        const subscription = await App.addListener("backButton", () => {
          const now = Date.now();
          if (now - lastBackAt.current < 220) return;
          lastBackAt.current = now;

          if (closeTopOverlay() || consumeNexRideBackHandlers()) return;
          const { pathname: path, router: nextRouter } = current.current;
          const parent = nexrideSafeParentPath(path, window.location.search);
          if (parent) {
            nextRouter.replace(parent);
            return;
          }
          // A single Back action at the application root follows Android's
          // normal task-exit intent. Never force repeated Back presses or sign
          // out the user; minimizing preserves live-trip/server state.
          void App.minimizeApp().catch(() => {
            showNotice("Use your device Home control to leave Biloo.");
          });
        });
        // Capacitor appStateChange is the native complement to web
        // visibilitychange. Consumers pause foreground-only GPS while hidden
        // and reconcile their data when the activity is resumed.
        const stateListener = await App.addListener("appStateChange", ({ isActive }) => {
          window.dispatchEvent(new Event(isActive ? "biloo:native-resume" : "biloo:native-pause"));
        }).catch(() => null);
        // If the optional lifecycle listener is unavailable, the Back
        // callback must still be cleaned up correctly and remain functional.
        if (disposed) {
          await Promise.all([subscription.remove(), stateListener?.remove()]);
        } else {
          removers = [() => subscription.remove()];
          if (stateListener) removers.push(() => stateListener.remove());
        }
      },
    ).catch(() => {
      // The web/PWA build retains browser navigation without a native plugin.
    });

    return () => {
      disposed = true;
      for (const remove of removers) void remove();
      if (clearNotice) window.clearTimeout(clearNotice);
    };
  }, []);

  return notice ? <div role="status" aria-live="polite" style={{
    position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom))",
    left: "50%", transform: "translateX(-50%)", zIndex: 2147483647,
    background: "#041C30", color: "#fff", borderRadius: 14,
    padding: "12px 18px", maxWidth: "calc(100vw - 36px)",
    width: "max-content", boxShadow: "0 12px 28px #041c3040",
    textAlign: "center", fontSize: 13, fontWeight: 650,
  }}>{notice}</div> : null;
}

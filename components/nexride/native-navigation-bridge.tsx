"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  consumeNexRideBackHandlers,
  nexrideSafeParentPath,
} from "../../lib/nexride-native-navigation";

function closeTopOverlay(): boolean {
  const modal = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")]
    .filter(node => node.getClientRects().length).at(-1);
  if (modal) {
    // Click its existing React close control so the dialog's state is cleared.
    modal.querySelector<HTMLButtonElement>(".nr-dialog-head button")?.click();
    return true;
  }
  const drawer = document.querySelector<HTMLElement>(".nr-driver-menu-layer, .nr-rider-drawer-layer");
  if (drawer) {
    drawer.querySelector<HTMLButtonElement>(".nr-driver-menu-close, .nr-rider-drawer-close")?.click();
    return true;
  }
  const focused = document.activeElement;
  if (focused instanceof HTMLElement &&
    focused.matches("input, textarea, select, [contenteditable='true']")) {
    focused.blur();
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
  const exitAt = useRef(0);
  const lastBackAt = useRef(0);

  useEffect(() => {
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    let clearNotice: ReturnType<typeof setTimeout> | undefined;

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

          if (closeTopOverlay() || consumeNexRideBackHandlers()) {
            exitAt.current = 0;
            return;
          }
          const { pathname: path, router: nextRouter } = current.current;
          const parent = nexrideSafeParentPath(path, window.location.search);
          if (parent) {
            exitAt.current = 0;
            nextRouter.replace(parent);
            return;
          }
          if (now - exitAt.current < 2400) {
            exitAt.current = 0;
            // Minimizing preserves Supabase sessions and never changes trip status.
            void App.minimizeApp().catch(() => {
              showNotice("Use your device Home control to leave NexRide.");
            });
          } else {
            exitAt.current = now;
            showNotice("Press Back again to minimize NexRide");
          }
        });
        if (disposed) await subscription.remove();
        else remove = () => subscription.remove();
      },
    ).catch(() => {
      // The web/PWA build retains browser navigation without a native plugin.
    });

    return () => {
      disposed = true;
      if (remove) void remove();
      if (clearNotice) window.clearTimeout(clearNotice);
    };
  }, []);

  return notice ? <div role="status" aria-live="polite" style={{
    position: "fixed", bottom: "calc(24px + env(safe-area-inset-bottom))",
    left: "50%", transform: "translateX(-50%)", zIndex: 2147483647,
    background: "#28217f", color: "#fff", borderRadius: 14,
    padding: "12px 18px", maxWidth: "calc(100vw - 36px)",
    width: "max-content", boxShadow: "0 12px 28px #14114840",
    textAlign: "center", fontSize: 13, fontWeight: 650,
  }}>{notice}</div> : null;
}

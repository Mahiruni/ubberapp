"use client";
import { useEffect } from "react";

/** Register or refresh offline support after visible content has a chance to load. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let idleId: number | undefined;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const register = () => {
      if (disposed) return;
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then(registration => { if (!disposed) return registration.update(); })
        .catch(() => { /* Offline support must not block Biloo. */ });
    };
    const schedule = () => {
      if (disposed) return;
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(register, { timeout: 3000 });
      } else {
        timerId = setTimeout(register, 1200);
      }
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      disposed = true;
      window.removeEventListener("load", schedule);
      if (idleId !== undefined && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timerId !== undefined) clearTimeout(timerId);
    };
  }, []);
  return null;
}

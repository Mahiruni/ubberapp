"use client";
import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "nexride-update") window.dispatchEvent(new Event("nexride:check-updates"));
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA enhancement must never block the ride experience.
      });
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  return null;
}

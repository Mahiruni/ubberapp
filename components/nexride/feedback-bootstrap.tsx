"use client";

import { useEffect } from "react";
import { primeNexRideAudio, stopRideRequestAlert } from "../../lib/nexride-feedback";

export function NexRideFeedbackBootstrap() {
  useEffect(() => {
    const unlock = () => { void primeNexRideAudio(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);

    const onPageHide = () => {
      stopRideRequestAlert();
    };
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}

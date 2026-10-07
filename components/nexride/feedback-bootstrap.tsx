"use client";

import { useEffect } from "react";
import { primeNexRideAudio, stopNexRideNavigationVoice, stopRideRequestAlert } from "../../lib/nexride-feedback";

export function NexRideFeedbackBootstrap() {
  useEffect(() => {
    const unlock = () => { void primeNexRideAudio(); };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });

    const onPageHide = () => {
      stopRideRequestAlert();
      stopNexRideNavigationVoice();
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

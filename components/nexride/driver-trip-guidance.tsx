"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui";
import "./driver-trip-guidance.css";

/** Live trip content belongs to the fixed app header, outside the map canvas. */
export function DriverTripGuidance({ badge, instruction, distance, detail, label = "Live trip guidance" }: {
  badge: string;
  instruction: string;
  distance: string;
  detail?: string;
  label?: string;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const slot = document.getElementById("biloo-driver-trip-header-slot");
    const header = slot?.closest<HTMLElement>(".nr-driver-global-header");
    const shell = header?.closest<HTMLElement>(".nr-driver-app-shell");
    if (!slot || !header || !shell) return;
    setHost(slot);

    // Include wrapped instructions and Android safe areas in the available
    // map height. The map's existing ResizeObserver then updates its camera.
    const previous = shell.style.getPropertyValue("--driver-header-total");
    const measure = () => {
      const height = `${Math.ceil(header.getBoundingClientRect().height)}px`;
      if (shell.style.getPropertyValue("--driver-header-total") !== height)
        shell.style.setProperty("--driver-header-total", height);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(header);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (previous) shell.style.setProperty("--driver-header-total", previous);
      else shell.style.removeProperty("--driver-header-total");
    };
  }, []);

  if (!host) return null;
  return createPortal(
    <section className="nr-nav-guidance biloo-driver-trip-guidance" aria-label={label} aria-live="polite">
      <span className="nr-nav-guidance-icon" aria-hidden="true"><Icon name="navigation" size={27} /></span>
      <div className="biloo-driver-guidance-copy">
        <div className="biloo-driver-guidance-meta">
          <small>{badge}</small>
          <span className="nr-nav-guidance-distance">{distance}</span>
        </div>
        <strong>{instruction}</strong>
        {detail && <em>{detail}</em>}
      </div>
    </section>,
    host,
  );
}

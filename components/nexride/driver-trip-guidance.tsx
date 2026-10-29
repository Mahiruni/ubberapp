"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./ui";
import "./driver-trip-guidance.css";

function ManeuverIcon({ type, modifier }: { type?: string; modifier?: string }) {
  if (type === "arrive") return <Icon name="pin" size={28} />;
  const left = modifier?.includes("left");
  const turn = left || modifier?.includes("right");
  const path = modifier?.includes("uturn")
    ? "M8 27V13a8 8 0 0 1 16 0v8m-6-6 6 6 6-6"
    : turn ? "M8 27V19a7 7 0 0 1 7-7h12m-7-7 7 7-7 7"
    : "M16 27V5m-8 8 8-8 8 8";
  return <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} transform={left ? "translate(32 0) scale(-1 1)" : undefined} />
  </svg>;
}

/** One compact trip header leaves the map free of the former detail sheet. */
export function DriverTripGuidance({ badge, instruction, distance, detail, label = "Live trip guidance", stop, detailsLabel, maneuverType, maneuverModifier, children }: {
  badge: string;
  instruction: string;
  distance: string;
  detail?: string;
  label?: string;
  stop: { label: string; name: string; arrival: string };
  detailsLabel: string;
  maneuverType?: string;
  maneuverModifier?: string;
  children: ReactNode;
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
    <div className="biloo-driver-trip-header">
      <section className="nr-nav-guidance biloo-driver-trip-guidance" aria-label={label} aria-live="polite">
        <span className="nr-nav-guidance-icon" aria-hidden="true"><ManeuverIcon type={maneuverType} modifier={maneuverModifier} /></span>
        <div className="biloo-driver-guidance-copy">
          <div className="biloo-driver-guidance-meta">
            <small>{badge}</small>
            {detail && <em>{detail}</em>}
          </div>
          <strong>{instruction}</strong>
        </div>
        <span className="nr-nav-guidance-distance">{distance}</span>
      </section>
      <details className="biloo-driver-trip-details">
        <summary>
          <span className="biloo-driver-stop-icon" aria-hidden="true"><Icon name="pin" size={22} /></span>
          <div className="nr-nav-current-destination">
            <small>{stop.label}</small>
            <h1>{stop.name}</h1>
            <p><Icon name="clock" size={12} />{stop.arrival}</p>
          </div>
          <span className="biloo-driver-details-toggle"><span>{detailsLabel}</span><Icon name="chevron" size={16} /></span>
        </summary>
        <div className="biloo-driver-trip-details-body">{children}</div>
      </details>
    </div>,
    host,
  );
}

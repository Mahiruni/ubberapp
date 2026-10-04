"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Icon, useTranslation } from "./ui";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
import "leaflet/dist/leaflet.css";
export function RiderMap({
  position,
  status,
  locate,
  recenter,
  initials,
  onProfile,
}: {
  position: RiderLocation | null;
  status: LocationStatus;
  locate: () => void;
  recenter: number;
  initials: string;
  onProfile: () => void;
}) {
  const t = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const marker = useRef<Leaflet.LayerGroup | null>(null);
  const [tiles, setTiles] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resize: ResizeObserver | undefined;
    setTiles("loading");
    import("leaflet")
      .then((L) => {
        if (!active || !container.current) return;
        library.current = L;
        const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
        const view = L.map(container.current, {
          zoomControl: false,
          attributionControl: false,
          zoomAnimation: !reduced,
          fadeAnimation: !reduced,
          markerZoomAnimation: !reduced,
          minZoom: 3,
          maxZoom: 19,
        }).setView([9.008, 38.775], 14);
        map.current = view;
        let loaded = 0;
        const tileLayer = L.tileLayer(
          process.env.NEXT_PUBLIC_MAP_TILE_URL ||
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            keepBuffer: 1,
            referrerPolicy: "strict-origin-when-cross-origin",
          },
        );
        const ready = () => {
          loaded++;
          if (active) {
            setTiles("ready");
            if (timer) clearTimeout(timer);
          }
        };
        tileLayer.on("tileload", ready);
        tileLayer.on("tileerror", () => {
          if (active) setTiles("unavailable");
        });
        tileLayer.on("load", () => {
          if (active && !loaded) setTiles("unavailable");
        });
        tileLayer.addTo(view);
        timer = setTimeout(() => {
          if (active && !loaded) setTiles("unavailable");
        }, 10000);
        resize = new ResizeObserver(() => view.invalidateSize());
        resize.observe(container.current);
        setMounted(true);
      })
      .catch(() => {
        if (active) setTiles("unavailable");
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      marker.current = null;
      setMounted(false);
    };
  }, [attempt]);
  useEffect(() => {
    if (!mounted || !map.current || !library.current) return;
    marker.current?.remove();
    marker.current = null;
    // A geographic fix is required; never place a user dot on an illustration.
    if (!position || status !== "ready") return;
    const L = library.current;
    marker.current = L.layerGroup([
      L.circle([position.lat, position.lng], {
        radius: position.accuracy,
        color: "#2985e5",
        weight: 1,
        opacity: 0.25,
        fillColor: "#2985e5",
        fillOpacity: 0.1,
        interactive: false,
        className: "nr-location-accuracy",
      }),
      L.circleMarker([position.lat, position.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2985e5",
        fillOpacity: 1,
        interactive: false,
        className: "nr-user-location-dot",
      }),
    ]).addTo(map.current);
    map.current.setView([position.lat, position.lng], 16, {
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [position, status, recenter, mounted]);
  // Availability is not connected. No invented vehicle markers are rendered.
  return (
    <section
      className="nr-rider-map-surface"
      aria-label={t("streetMap")}
      data-map-status={tiles}
    >
      <div
        ref={container}
        className="nr-geographic-map"
        role="region"
        aria-label={t("streetMap")}
      />
      {tiles === "unavailable" && (
        <div className="nr-map-unavailable">
          <Icon name="globe" size={26} />
          <p>{t("mapUnavailable")}</p>
          <button onClick={() => setAttempt((v) => v + 1)}>
            {t("tryAgain")}
          </button>
        </div>
      )}
      {tiles === "loading" && (
        <div className="nr-map-loading" role="status">
          <span className="nr-map-spinner" />
          {t("mapLoading")}
        </div>
      )}
      <div className="nr-rider-map-top">
        <button
          className="nr-map-profile"
          aria-label={t("profileNav")}
          onClick={onProfile}
        >
          {initials === "NR" ? <Icon name="user" size={21} /> : initials}
        </button>
        <span className="nr-map-preview-chip">{t("preview")}</span>
        <button
          className="nr-recenter"
          aria-label={t("recenter")}
          onClick={locate}
          disabled={status === "loading"}
        >
          <Icon name="locate" size={21} />
        </button>
      </div>
      <div className="nr-map-attribution">
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          © OpenStreetMap contributors
        </a>
      </div>
    </section>
  );
}

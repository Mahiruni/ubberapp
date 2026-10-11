"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import { Icon, Spinner } from "./ui";
import { useDriverTheme } from "./driver-app-shell";
import "mapbox-gl/dist/mapbox-gl.css";
import "./brand-map-markers.css";

export type NavigationCoordinate = { lat: number; lng: number };
export type NavigationTrafficSegment = {
  from: NavigationCoordinate;
  to: NavigationCoordinate;
  congestion?: "low" | "moderate" | "heavy" | "severe";
};

type MapView = "overview" | "vehicle";
type GpsState = "acquiring" | "fresh" | "stale" | "lost" | "unsupported";
type MapStyleKey = "streets" | "satellite" | "dark";

const STYLE_URLS: Record<MapStyleKey, string> = {
  streets: process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const INITIAL: [number, number] = [
  Number(process.env.NEXT_PUBLIC_MAPBOX_CENTER_LNG) || 38.775,
  Number(process.env.NEXT_PUBLIC_MAPBOX_CENTER_LAT) || 9.008,
];

const valid = (point: NavigationCoordinate | null | undefined): point is NavigationCoordinate =>
  Boolean(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180);

const lngLat = (point: NavigationCoordinate): [number, number] => [point.lng, point.lat];

const normalizedBearing = (bearing: number) => ((bearing + 180) % 360 + 360) % 360 - 180;

export function DriverNavigationMap({
  vehicle,
  pickup,
  destination,
  route = [],
  segments = [],
  target,
  view,
  gpsState,
  heading,
}: {
  vehicle: NavigationCoordinate | null;
  pickup: NavigationCoordinate | null;
  destination: NavigationCoordinate | null;
  route?: NavigationCoordinate[];
  segments?: NavigationTrafficSegment[];
  target: "pickup" | "destination";
  view: MapView;
  gpsState: GpsState;
  heading: number | null;
}) {
  const { resolvedTheme } = useDriverTheme();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const manualView = useRef(false);
  const lastCameraView = useRef<MapView>(view);
  const lastCameraTarget = useRef<"pickup" | "destination">(target);
  const loaded = useRef(false);
  const trafficAvailable = useRef(true);
  const [mountedRevision, setMountedRevision] = useState(0);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [styleKey, setStyleKey] = useState<MapStyleKey>(resolvedTheme === "dark" ? "dark" : "streets");
  const [layersOpen, setLayersOpen] = useState(false);
  const [trafficVisible, setTrafficVisible] = useState(true);
  const [trafficUnavailable, setTrafficUnavailable] = useState(false);
  const [bearing, setBearing] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!container.current) return;
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
      if (!token) {
        setMapStatus("unavailable");
        return;
      }

      const mapboxgl = await import("mapbox-gl");
      if (cancelled || !container.current) return;
      mapboxgl.default.accessToken = token;

      const map = new mapboxgl.default.Map({
        container: container.current,
        style: STYLE_URLS[resolvedTheme === "dark" ? "dark" : "streets"],
        center: INITIAL,
        zoom: 13.5,
        attributionControl: true,
        cooperativeGestures: false,
        logoPosition: "bottom-left",
      });
      mapRef.current = map;

      const markManual = (event: any) => {
        if (event?.originalEvent) manualView.current = true;
      };
      map.on("dragstart", markManual);
      map.on("zoomstart", markManual);
      map.on("rotatestart", markManual);
      map.on("rotate", () => setBearing(map.getBearing()));
      map.on("style.load", () => {
        if (cancelled) return;
        loaded.current = true;
        setMapStatus("ready");
        setMountedRevision((value) => value + 1);
      });
      map.on("load", () => {
        if (cancelled) return;
        loaded.current = true;
        setMapStatus("ready");
        setMountedRevision((value) => value + 1);
      });
      map.on("error", () => {
        if (!loaded.current && !cancelled) setMapStatus("unavailable");
      });
    };

    void boot();
    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    setStyleKey(resolvedTheme === "dark" ? "dark" : "streets");
  }, [resolvedTheme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    map.setStyle(STYLE_URLS[styleKey]);
  }, [styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "nr-driver-live-traffic";
    const layerId = "nr-driver-live-traffic-lines";
    try {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      setTrafficUnavailable(false);
      trafficAvailable.current = true;

      if (trafficVisible) {
        map.addSource(sourceId, { type: "vector", url: "mapbox://mapbox.mapbox-traffic-v1" });
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          "source-layer": "traffic",
          minzoom: 6,
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.2, 12, 2.4, 17, 5],
            "line-opacity": 0.68,
            "line-color": [
              "match",
              ["get", "congestion"],
              "low", "#22a06b",
              "moderate", "#d8a321",
              "heavy", "#df7928",
              "severe", "#d84a57",
              "#8c9aa4",
            ],
          },
        });
      }
    } catch {
      trafficAvailable.current = false;
      setTrafficUnavailable(true);
    }
  }, [trafficVisible, mountedRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = "nr-driver-route-source";
    const casingId = "nr-driver-route-casing";
    const lineId = "nr-driver-route-line";

    if (map.getLayer(lineId)) map.removeLayer(lineId);
    if (map.getLayer(casingId)) map.removeLayer(casingId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const validRoute = route.filter(valid);
    if (validRoute.length < 2) return;

    const segmentFeatures = segments
      .filter((segment) => valid(segment.from) && valid(segment.to))
      .map((segment) => ({
        type: "Feature" as const,
        properties: { congestion: segment.congestion || "unknown" },
        geometry: {
          type: "LineString" as const,
          coordinates: [lngLat(segment.from), lngLat(segment.to)],
        },
      }));

    const features = segmentFeatures.length
      ? segmentFeatures
      : [{
          type: "Feature" as const,
          properties: { congestion: "unknown" },
          geometry: { type: "LineString" as const, coordinates: validRoute.map(lngLat) },
        }];

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });
    map.addLayer({
      id: casingId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": styleKey === "dark" ? "#07131d" : "#f8fbfd",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 13],
        "line-opacity": 0.96,
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: lineId,
      type: "line",
      source: sourceId,
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
        "line-opacity": 0.98,
        "line-color": [
          "match",
          ["get", "congestion"],
          "low", "#19b874",
          "moderate", "#d7a121",
          "heavy", "#e17729",
          "severe", "#d84a57",
          "#00c878",
        ],
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }, [route, segments, mountedRevision, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    let cancelled = false;
    void import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapRef.current) return;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];

      const addMarker = (point: NavigationCoordinate, kind: "vehicle" | "pickup" | "destination", active: boolean) => {
        const element = document.createElement("div");
        element.className = `nr-driver-map-marker ${kind}${active ? " active" : ""}${gpsState !== "fresh" && kind === "vehicle" ? " stale" : ""}`;
        if (kind === "vehicle" && Number.isFinite(heading)) element.style.setProperty("--nr-heading", `${Math.round(Number(heading))}deg`);
        if (kind === "vehicle") {
          // Approaching is only shown while navigating to a real pickup.
          if (target === "pickup") element.classList.add("approaching");
          element.setAttribute("role", "img");
          element.setAttribute("aria-label", target === "pickup" ? "NexRide driver approaching pickup" : "NexRide vehicle");
          element.innerHTML = '<svg class="nr-branded-car-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 17-1 2v2m15-4 1 2v2M5 17H4a2 2 0 0 1-2-2v-3l2-2 2-5a2 2 0 0 1 2-1h8a2 2 0 0 1 2 1l2 5 2 2v3a2 2 0 0 1-2 2h-1M5 17h14M4 10h16M7 14h.01M17 14h.01"/></svg>';
        } else {
          element.setAttribute("role", "img");
          element.setAttribute("aria-label", kind === "pickup" ? "Pickup location" : "Destination");
        }
        const marker = new mapboxgl.default.Marker({ element, anchor: "center" }).setLngLat(lngLat(point)).addTo(mapRef.current!);
        markers.current.push(marker);
      };

      if (valid(vehicle)) addMarker(vehicle, "vehicle", false);
      if (valid(pickup)) addMarker(pickup, "pickup", target === "pickup");
      if (valid(destination)) addMarker(destination, "destination", target === "destination");
    });

    return () => { cancelled = true; };
  }, [vehicle?.lat, vehicle?.lng, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, target, gpsState, heading, mountedRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const viewChanged = lastCameraView.current !== view;
    const targetChanged = lastCameraTarget.current !== target;
    if (viewChanged || targetChanged) manualView.current = false;
    lastCameraView.current = view;
    lastCameraTarget.current = target;
    if (manualView.current) return;

    const points = route.filter(valid);
    if (valid(vehicle)) points.push(vehicle);
    const targetPoint = target === "pickup" ? pickup : destination;
    if (valid(targetPoint)) points.push(targetPoint);

    if (view === "vehicle" && valid(vehicle)) {
      map.easeTo({
        center: lngLat(vehicle),
        zoom: Math.max(15.8, map.getZoom()),
        bearing: Number.isFinite(heading) ? Number(heading) : map.getBearing(),
        pitch: 34,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260,
      });
      return;
    }

    if (view === "overview" && points.length) {
      if (points.length === 1) {
        map.easeTo({ center: lngLat(points[0]), zoom: 15, duration: 260 });
        return;
      }
      const west = Math.min(...points.map((point) => point.lng));
      const east = Math.max(...points.map((point) => point.lng));
      const south = Math.min(...points.map((point) => point.lat));
      const north = Math.max(...points.map((point) => point.lat));
      map.fitBounds([[west, south], [east, north]], {
        padding: { top: 110, right: 74, bottom: 220, left: 34 },
        maxZoom: 16,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320,
      });
    }
  }, [view, target, route, vehicle?.lat, vehicle?.lng, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, heading, mountedRevision]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    manualView.current = false;
    if (valid(vehicle)) {
      map.easeTo({ center: lngLat(vehicle), zoom: Math.max(map.getZoom(), 16), duration: 260 });
      return;
    }
    const point = target === "pickup" ? pickup : destination;
    if (valid(point)) map.easeTo({ center: lngLat(point), zoom: 15, duration: 260 });
  };

  const showCompass = Math.abs(normalizedBearing(bearing)) > 2;

  return (
    <div className="nr-navigation-map nr-live-navigation-map" role="region" aria-label="Live NexRide Mapbox route map" data-gps={gpsState} data-target={target}>
      <div ref={container} className="nr-live-navigation-canvas" />

      {mapStatus === "loading" && <div className="nr-driver-map-loading" role="status"><Spinner /> Loading live map…</div>}
      {mapStatus === "unavailable" && (
        <div className="nr-live-map-status route" role="alert">
          Live map unavailable. Route details and stage controls remain available.
        </div>
      )}
      {route.filter(valid).length < 2 && mapStatus === "ready" && (
        <div className="nr-live-map-status route" role="status">
          Road route is unavailable. NexRide will not draw a straight-line estimate.
        </div>
      )}
      {trafficUnavailable && <div className="nr-driver-traffic-unavailable" role="status">Traffic data unavailable</div>}

      <div className="nr-driver-map-controls" aria-label="Driver map controls">
        <button type="button" onClick={recenter} aria-label="Recenter map"><Icon name="locate" size={21} /></button>
        <button type="button" onClick={() => setLayersOpen((open) => !open)} aria-expanded={layersOpen} aria-label="Map layers"><Icon name="globe" size={21} /></button>
        {showCompass && (
          <button type="button" aria-label="Reset map north" onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 220 })}>
            <span style={{ display: "grid", placeItems: "center", transform: `rotate(${-bearing}deg)` }}><Icon name="navigation" size={21} /></span>
          </button>
        )}
      </div>

      {layersOpen && (
        <div className="nr-driver-layer-menu" role="menu" aria-label="Map style and traffic">
          {(["streets", "satellite", "dark"] as MapStyleKey[]).map((key) => (
            <button key={key} type="button" role="menuitemradio" aria-checked={styleKey === key} onClick={() => { setStyleKey(key); setLayersOpen(false); }}>
              <span>{key === "streets" ? "Streets" : key === "satellite" ? "Satellite" : "Dark"}</span>
              {styleKey === key && <Icon name="check" size={16} />}
            </button>
          ))}
          <button type="button" role="menuitemcheckbox" aria-checked={trafficVisible} onClick={() => setTrafficVisible((visible) => !visible)}>
            <span>Live traffic</span><span className={`nr-driver-traffic-switch ${trafficVisible ? "on" : ""}`} aria-hidden="true"><i /></span>
          </button>
        </div>
      )}
    </div>
  );
}

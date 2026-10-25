"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import { Icon, Spinner } from "./ui";
import { useDriverTheme } from "./driver-app-shell";
import { applyBilooCityMapPalette, BILOO_STYLE_SWAP_OPTIONS } from "../../lib/biloo-map-palette";
import { driverCarMarkerElement, useDriverMapAvatar } from "../../lib/biloo-driver-map-avatar-client";
import "mapbox-gl/dist/mapbox-gl.css";

export type NavigationCoordinate = { lat: number; lng: number };
type MapView = "overview" | "vehicle";
type GpsState = "acquiring" | "fresh" | "stale" | "lost" | "unsupported";
type MapStyleKey = "streets" | "satellite" | "dark";

const STYLE_URLS: Record<MapStyleKey, string> = {
  streets: process.env.NEXT_PUBLIC_MAPBOX_STYLE || "mapbox://styles/mapbox/light-v11",
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

/** Frame the actual GPS point above trip controls, with room for the whole car. */
function navigationMapPadding(map: MapboxMap) {
  const canvas = map.getContainer();
  const rect = canvas.getBoundingClientRect();
  const page = canvas.closest('.nr-driver-navigation-page');
  const sheet = page?.querySelector('.nr-nav-bottom-card')?.getBoundingClientRect();
  const guidance = page?.querySelector('.nr-nav-guidance')?.getBoundingClientRect();
  const sidePanel = sheet && rect.width >= 760 && sheet.left > rect.left + rect.width * .45;
  const top = Math.min(Math.max(110, (guidance?.bottom || rect.top) - rect.top + 55), Math.max(40, rect.height - 180));
  const left = 55;
  const right = Math.max(74, Math.min(sidePanel ? rect.right - sheet.left + 65 : 74, rect.width - left - 110));
  const bottom = Math.min(sidePanel ? 75 : Math.max(110, sheet ? rect.bottom - sheet.top + 65 : 220), Math.max(55, rect.height - top - 110));
  return { top, right, bottom, left };
}

export function DriverNavigationMap({
  vehicle,
  pickup,
  destination,
  route = [],
  target,
  view,
  gpsState,
  heading,
}: {
  vehicle: NavigationCoordinate | null;
  pickup: NavigationCoordinate | null;
  destination: NavigationCoordinate | null;
  route?: NavigationCoordinate[];
  target: "pickup" | "destination";
  view: MapView;
  gpsState: GpsState;
  heading: number | null;
}) {
  const { resolvedTheme } = useDriverTheme();
  const driverAvatar = useDriverMapAvatar(true);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const manualView = useRef(false);
  const lastCameraView = useRef<MapView>(view);
  const lastCameraTarget = useRef<"pickup" | "destination">(target);
  const loaded = useRef(false);
  const activeStyle = useRef<MapStyleKey>(resolvedTheme === "dark" ? "dark" : "streets");
  const [mountedRevision, setMountedRevision] = useState(0);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [styleKey, setStyleKey] = useState<MapStyleKey>(resolvedTheme === "dark" ? "dark" : "streets");
  const [layersOpen, setLayersOpen] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [cameraLayoutRevision, setCameraLayoutRevision] = useState(0);

  useEffect(() => {
    const page = container.current?.closest('.nr-driver-navigation-page');
    if (!page) return;
    let frame = 0;
    const refresh = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setCameraLayoutRevision(value => value + 1)); };
    const observer = new ResizeObserver(refresh);
    for (const element of [container.current, page.querySelector('.nr-nav-bottom-card'), page.querySelector('.nr-nav-guidance')]) if (element) observer.observe(element);
    refresh();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [mountedRevision]);

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
        applyBilooCityMapPalette(map, activeStyle.current);
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
    if (!map || activeStyle.current === styleKey) return;
    activeStyle.current = styleKey;
    map.setStyle(STYLE_URLS[styleKey], BILOO_STYLE_SWAP_OPTIONS);
  }, [styleKey, mountedRevision]);

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

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature", properties: {},
        geometry: { type: "LineString", coordinates: validRoute.map(lngLat) },
      },
    });
    map.addLayer({
      id: casingId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": styleKey === "dark" ? "#181818" : "#f8fbfd",
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
        "line-color": "#F9C449",
      },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }, [route, mountedRevision, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    // DOM markers stay available while route sources finish loading.
    if (!map) return;

    let cancelled = false;
    void import("mapbox-gl").then((mapboxgl) => {
      if (cancelled || !mapRef.current) return;
      markers.current.forEach((marker) => marker.remove());
      markers.current = [];

      const addMarker = (point: NavigationCoordinate, kind: "vehicle" | "pickup" | "destination", active: boolean) => {
        const element = kind === "vehicle" ? driverCarMarkerElement("Your Biloo vehicle", driverAvatar, heading, bearing) : document.createElement("div");
        element.classList.add("nr-driver-map-marker", kind);
        if (active) element.classList.add("active");
        if (gpsState !== "fresh" && kind === "vehicle") element.classList.add("stale");
        if (kind !== "vehicle") element.setAttribute("aria-hidden", "true");
        const marker = new mapboxgl.default.Marker({ element, anchor: "center" }).setLngLat(lngLat(point)).addTo(mapRef.current!);
        markers.current.push(marker);
      };

      if (valid(vehicle)) addMarker(vehicle, "vehicle", false);
      if (valid(pickup)) addMarker(pickup, "pickup", target === "pickup");
      if (valid(destination)) addMarker(destination, "destination", target === "destination");
    });

    return () => { cancelled = true; };
  }, [vehicle?.lat, vehicle?.lng, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, target, gpsState, heading, mountedRevision, driverAvatar, bearing]);

  useEffect(() => {
    const map = mapRef.current;
    // Fitting the camera does not depend on secondary route tile readiness.
    if (!map) return;

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
        padding: navigationMapPadding(map),
        retainPadding: false,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260,
      });
      return;
    }

    if (view === "overview" && points.length) {
      if (points.length === 1) {
        map.easeTo({ center: lngLat(points[0]), zoom: 15, padding: navigationMapPadding(map), retainPadding: false, duration: 260 });
        return;
      }
      const west = Math.min(...points.map((point) => point.lng));
      const east = Math.max(...points.map((point) => point.lng));
      const south = Math.min(...points.map((point) => point.lat));
      const north = Math.max(...points.map((point) => point.lat));
      map.fitBounds([[west, south], [east, north]], {
        padding: navigationMapPadding(map),
        retainPadding: false,
        maxZoom: 16,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320,
      });
    }
  }, [view, target, route, vehicle?.lat, vehicle?.lng, pickup?.lat, pickup?.lng, destination?.lat, destination?.lng, heading, mountedRevision, cameraLayoutRevision]);

  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    manualView.current = false;
    if (valid(vehicle)) {
      map.easeTo({ center: lngLat(vehicle), zoom: Math.max(map.getZoom(), 16), padding: navigationMapPadding(map), retainPadding: false, duration: 260 });
      return;
    }
    const point = target === "pickup" ? pickup : destination;
    if (valid(point)) map.easeTo({ center: lngLat(point), zoom: 15, padding: navigationMapPadding(map), retainPadding: false, duration: 260 });
  };

  const showCompass = Math.abs(normalizedBearing(bearing)) > 2;

  return (
    <div className="nr-navigation-map nr-live-navigation-map" role="region" aria-label="Live Biloo Mapbox route map" data-gps={gpsState} data-target={target} data-map-style={styleKey}>
      <div ref={container} className="nr-live-navigation-canvas" />

      {mapStatus === "loading" && <div className="nr-driver-map-loading" role="status"><Spinner /> Loading live map…</div>}
      {mapStatus === "unavailable" && (
        <div className="nr-live-map-status route" role="alert">
          Live map unavailable. Route details and stage controls remain available.
        </div>
      )}
      {route.filter(valid).length < 2 && mapStatus === "ready" && (
        <div className="nr-live-map-status route" role="status">
          Road route is unavailable. Biloo will not draw a straight-line estimate.
        </div>
      )}

      <div className="nr-driver-map-controls" aria-label="Driver map controls">
        <button type="button" onClick={recenter} aria-label="Recenter map"><Icon name="locate" size={21} /></button>
        <button type="button" onClick={() => setLayersOpen((open) => !open)} aria-haspopup="menu" aria-controls="biloo-driver-map-layers" aria-expanded={layersOpen} aria-label="Map layers"><Icon name="globe" size={21} /></button>
        {showCompass && (
          <button type="button" aria-label="Reset map north" onClick={() => mapRef.current?.easeTo({ bearing: 0, duration: 220 })}>
            <span style={{ display: "grid", placeItems: "center", transform: `rotate(${-bearing}deg)` }}><Icon name="navigation" size={21} /></span>
          </button>
        )}
      </div>

      {layersOpen && (
        <div id="biloo-driver-map-layers" className="nr-driver-layer-menu" role="menu" aria-label="Map style">
          {(["streets", "satellite", "dark"] as MapStyleKey[]).map((key) => (
            <button key={key} type="button" role="menuitemradio" aria-checked={styleKey === key} onClick={() => { setStyleKey(key); setLayersOpen(false); }}>
              <span>{key === "streets" ? "Streets" : key === "satellite" ? "Satellite" : "Dark"}</span>
              {styleKey === key && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

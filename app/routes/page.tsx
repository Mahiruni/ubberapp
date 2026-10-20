"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./route-explorer.css";

type Point = { lat: number; lng: number; name: string };
type Route = {
  status: "ready"; origin: Point; destination: Point;
  distanceMeters: number; durationSeconds: number;
  geometry: [number, number][]; provider: "mapbox";
};
const center: [number, number] = [38.752413, 9.035829];
const formatHours = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
};

export default function RouteExplorer() {
  const [origin, setOrigin] = useState("Addis Ababa");
  const [destination, setDestination] = useState("Mattuu");
  const [route, setRoute] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const markers = useRef<MapboxMarker[]>([]);
  const mounted = useRef(true);
  const latestRoute = useRef<Route | null>(null);

  const renderRoute = useCallback((current: Route) => {
    const instance = map.current;
    if (!instance || !instance.isStyleLoaded()) return;
    const coordinates = current.geometry.map(([lat, lng]) => [lng, lat] as [number, number]);
    const geometry = { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates } };
    const data = { type: "FeatureCollection" as const, features: [geometry] };
    const source = instance.getSource("biloo-explorer-route") as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else instance.addSource("biloo-explorer-route", { type: "geojson", data });
    if (!instance.getLayer("biloo-explorer-route-outline")) instance.addLayer({
      id: "biloo-explorer-route-outline", type: "line", source: "biloo-explorer-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.95 },
    });
    if (!instance.getLayer("biloo-explorer-route-line")) instance.addLayer({
      id: "biloo-explorer-route-line", type: "line", source: "biloo-explorer-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#08295f", "line-width": 5 },
    });
    markers.current.forEach(marker => marker.remove());
    markers.current = [];
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (!mounted.current || map.current !== instance) return;
      for (const [point, label, color] of [
        [current.origin, "Start: " + current.origin.name, "#00a876"],
        [current.destination, "Destination: " + current.destination.name, "#08295f"],
      ] as [Point, string, string][]) {
        const node = document.createElement("div");
        node.className = "biloo-route-pin";
        node.style.backgroundColor = color;
        node.setAttribute("role", "img");
        node.setAttribute("aria-label", label);
        markers.current.push(new mapboxgl.Marker({ element: node })
          .setLngLat([point.lng, point.lat]).addTo(instance));
      }
    }).catch(() => {});
    const bounds = coordinates.reduce(
      (box, coordinate) => {
        box[0][0] = Math.min(box[0][0], coordinate[0]); box[0][1] = Math.min(box[0][1], coordinate[1]);
        box[1][0] = Math.max(box[1][0], coordinate[0]); box[1][1] = Math.max(box[1][1], coordinate[1]);
        return box;
      }, [[Infinity, Infinity], [-Infinity, -Infinity]] as [[number, number], [number, number]],
    );
    instance.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 300 });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!container.current) return;
    if (!token) { setMapError("Interactive map is unavailable until the public Mapbox token is configured."); return; }
    let cancelled = false;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !container.current) return;
      mapboxgl.accessToken = token;
      const instance = new mapboxgl.Map({
        container: container.current, style: "mapbox://styles/mapbox/streets-v12",
        center, zoom: 6, attributionControl: true,
      });
      map.current = instance;
      instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      instance.on("load", () => { if (latestRoute.current) renderRoute(latestRoute.current); });
      instance.on("style.load", () => { if (latestRoute.current) renderRoute(latestRoute.current); });
      instance.on("error", () => setMapError("The map could not load. Verify the Mapbox token and connection."));
    }).catch(() => setMapError("The interactive map could not load."));
    return () => {
      cancelled = true; mounted.current = false;
      markers.current.forEach(marker => marker.remove()); markers.current = [];
      map.current?.remove(); map.current = null;
    };
  }, [renderRoute]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/route-explorer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination }), signal: AbortSignal.timeout(18000),
      });
      const data = await response.json();
      if (!response.ok || data.status !== "ready") throw new Error(data.message || "No driving route was found.");
      if (!mounted.current) return;
      setRoute(data as Route); latestRoute.current = data as Route;
      renderRoute(data as Route);
    } catch (err) {
      if (mounted.current) { setRoute(null); latestRoute.current = null; setError(err instanceof Error ? err.message : "Unable to find route."); }
    } finally { if (mounted.current) setBusy(false); }
  };

  return (
    <main className="biloo-route-explorer">
      <header className="biloo-route-header">
        <Link href="/" className="biloo-route-back" aria-label="Back to Rider home">←</Link>
        <div><span className="biloo-route-brand">BILOO</span><h1>Explore routes</h1></div>
        <span className="biloo-route-tag">ETHIOPIA</span>
      </header>
      <form className="biloo-route-form" onSubmit={submit}>
        <label>From<input name="origin" value={origin} onChange={event => setOrigin(event.target.value)} maxLength={100} autoComplete="off" required /></label>
        <button className="biloo-route-swap" type="button" onClick={() => { setOrigin(destination); setDestination(origin); }} aria-label="Swap locations">⇄</button>
        <label>To<input name="destination" value={destination} onChange={event => setDestination(event.target.value)} maxLength={100} autoComplete="off" required /></label>
        <button type="submit" className="biloo-route-find" disabled={busy}>{busy ? "Finding route…" : "Show driving route →"}</button>
      </form>
      {error && <p role="alert" className="biloo-route-error">{error}</p>}
      {route && <section className="biloo-route-summary" aria-live="polite">
        <div><span>DISTANCE</span><strong>{(route.distanceMeters / 1000).toFixed(1)} km</strong></div>
        <div><span>ESTIMATED DRIVE</span><strong>{formatHours(route.durationSeconds)}</strong></div>
      </section>}
      <section className="biloo-route-map-shell" aria-label="Interactive driving route map">
        <div ref={container} className="biloo-route-map" />
        {mapError && <p className="biloo-route-map-error" role="status">{mapError}</p>}
      </section>
      <p className="biloo-route-notice">Route Explorer is for planning only. Road conditions and travel times may change. Viewing a route does not confirm Biloo booking coverage or driver availability.</p>
      <Link className="biloo-route-home-link" href="/">← Return to Biloo Rider</Link>
    </main>
  );
}

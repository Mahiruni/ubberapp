"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { GeoJSONSource, Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { applyBilooCityMapPalette, BILOO_STYLE_SWAP_OPTIONS } from "../../lib/biloo-map-palette";
import "./route-explorer.css";

type Point = { lat: number; lng: number; name: string };
type PlaceSuggestion = Point & { id: string; label: string };
type SearchField = "origin" | "destination";
type RouteResult = {
  status: "ready";
  origin: Point;
  destination: Point;
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][];
  provider: "mapbox";
};
type StyleName = "streets" | "satellite" | "night";

const MAP_STYLES: Record<StyleName, string> = {
  streets: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  night: "mapbox://styles/mapbox/dark-v11",
};
const INITIAL_CENTER: [number, number] = [38.752413, 9.035829];
const STORAGE_KEY = "biloo.route-explorer.map-style.v1";

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return String(minutes) + " min";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return String(hours) + " hr" + (remaining ? " " + String(remaining) + " min" : "");
}

function boundsOfRoute(coordinates: [number, number][]) {
  return coordinates.reduce(
    (bounds, coordinate) => {
      bounds[0][0] = Math.min(bounds[0][0], coordinate[0]);
      bounds[0][1] = Math.min(bounds[0][1], coordinate[1]);
      bounds[1][0] = Math.max(bounds[1][0], coordinate[0]);
      bounds[1][1] = Math.max(bounds[1][1], coordinate[1]);
      return bounds;
    },
    [[Infinity, Infinity], [-Infinity, -Infinity]] as [[number, number], [number, number]],
  );
}

export default function RouteExplorerPage() {
  const [origin, setOrigin] = useState("Addis Ababa");
  const [destination, setDestination] = useState("");
  const [selected, setSelected] = useState<{ origin: PlaceSuggestion | null; destination: PlaceSuggestion | null }>({
    origin: null, destination: null,
  });
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<"idle" | "searching" | "ready" | "error">("idle");
  const [panelOpen, setPanelOpen] = useState(true);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [mapStyle, setMapStyle] = useState<StyleName>("streets");
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mapError, setMapError] = useState("");
  const [toast, setToast] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const mapboxClassRef = useRef<typeof import("mapbox-gl")["default"] | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const currentRouteRef = useRef<RouteResult | null>(null);
  const styleRef = useRef<StyleName>("streets");
  const requestRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);

  const drawRoute = useCallback((result: RouteResult) => {
    const map = mapRef.current;
    const mapboxgl = mapboxClassRef.current;
    if (!map || !mapboxgl || !map.isStyleLoaded()) return;

    const coordinates = result.geometry.map(([lat, lng]) => [lng, lat] as [number, number]);
    if (coordinates.length < 2) return;
    const collection = {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        properties: {},
        geometry: { type: "LineString" as const, coordinates },
      }],
    };
    const source = map.getSource("biloo-route-explorer") as GeoJSONSource | undefined;
    if (source) source.setData(collection);
    else map.addSource("biloo-route-explorer", { type: "geojson", data: collection });

    if (!map.getLayer("biloo-route-halo")) {
      map.addLayer({
        id: "biloo-route-halo",
        type: "line",
        source: "biloo-route-explorer",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": styleRef.current === "night" ? "#10376b" : "#ffffff", "line-width": 10, "line-opacity": 0.98 },
      });
    }
    if (!map.getLayer("biloo-route-main")) {
      map.addLayer({
        id: "biloo-route-main",
        type: "line",
        source: "biloo-route-explorer",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": styleRef.current === "night" ? "#f9c449" : "#08295f", "line-width": 6, "line-opacity": 0.98 },
      });
    }

    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    ([
      { point: result.origin, kind: "start", label: "Starting point: " + result.origin.name },
      { point: result.destination, kind: "end", label: "Destination: " + result.destination.name },
    ] as const).forEach(({ point, kind, label }) => {
      const node = document.createElement("div");
      node.className = "biloo-explore-pin biloo-explore-pin--" + kind;
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", label);
      node.title = label;
      const core = document.createElement("span");
      core.className = "biloo-explore-pin-core";
      node.append(core);
      markersRef.current.push(
        new mapboxgl.Marker({ element: node, anchor: "center" })
          .setLngLat([point.lng, point.lat]).addTo(map),
      );
    });

    const desktop = window.innerWidth >= 920;
    const padding = desktop
      ? { top: 90, right: 70, bottom: 80, left: 460 }
      : { top: 65, right: 38, bottom: 105, left: 38 };
    map.fitBounds(boundsOfRoute(coordinates), {
      padding,
      maxZoom: 13,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500,
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    const initialize = async () => {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();
      if (!token) {
        setMapError("Map tiles are unavailable. Please check the Biloo Mapbox configuration.");
        return;
      }
      try {
        const { default: mapboxgl } = await import("mapbox-gl");
        if (disposed || !containerRef.current) return;
        mapboxClassRef.current = mapboxgl;
        mapboxgl.accessToken = token;
        let preferred: StyleName = "streets";
        try {
          const saved = window.localStorage.getItem(STORAGE_KEY);
          if (saved === "streets" || saved === "satellite" || saved === "night") preferred = saved;
        } catch { /* Browsers may block local preference storage. */ }
        styleRef.current = preferred;
        setMapStyle(preferred);
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: MAP_STYLES[preferred],
          center: INITIAL_CENTER,
          zoom: 6.6,
          attributionControl: true,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
          showUserLocation: true,
        }), "top-right");
        map.on("style.load", () => {
          if (disposed) return;
          applyBilooCityMapPalette(map, styleRef.current === "night" ? "dark" : styleRef.current);
          setMapReady(true);
          setMapError("");
          if (currentRouteRef.current) drawRoute(currentRouteRef.current);
        });
        map.on("error", () => {
          if (disposed) return;
          setMapError("The map is having trouble loading. Check your connection and try changing the map style.");
        });
      } catch {
        if (!disposed) setMapError("The interactive map could not be initialized.");
      }
    };
    void initialize();

    return () => {
      disposed = true;
      mountedRef.current = false;
      requestRef.current?.abort();
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [drawRoute]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try { window.localStorage.setItem(STORAGE_KEY, mapStyle); } catch { /* Optional preference. */ }
    const current = map.getStyle();
    if (!current) return;
    const expected = MAP_STYLES[mapStyle];
    // Mapbox's current style can be a resolved object rather than the original URL.
    // A redundant setStyle is harmless but avoid it while the initial style is loading.
    if (map.isStyleLoaded()) {
      setMapReady(false);
      map.setStyle(expected, BILOO_STYLE_SWAP_OPTIONS);
    }
  }, [mapStyle]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);


  // Separate nationwide route search: it never changes Biloo's ride-booking coverage.
  useEffect(() => {
    const field = activeField;
    const query = (field === "origin" ? origin : destination).trim();
    if (!field || query.length < 3) {
      setSuggestions([]);
      setSuggestionStatus("idle");
      return;
    }
    const controller = new AbortController();
    setSuggestionStatus("searching");
    setSuggestions([]);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          "/api/route-explorer/places?q=" + encodeURIComponent(query),
          { signal: controller.signal, cache: "no-store" },
        );
        const data: { status?: string; results?: PlaceSuggestion[] } = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || data.status !== "ready") throw new Error("search_unavailable");
        setSuggestions(Array.isArray(data.results) ? data.results.slice(0, 7) : []);
        setSuggestionStatus("ready");
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionStatus("error");
        }
      }
    }, 340);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeField, origin, destination]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const instance = mapRef.current;
      instance?.resize();
      if (currentRouteRef.current && instance?.isStyleLoaded()) drawRoute(currentRouteRef.current);
    }, 70);
    return () => window.clearTimeout(timer);
  }, [panelOpen, drawRoute]);

  function editField(field: SearchField, value: string) {
    if (field === "origin") setOrigin(value);
    else setDestination(value);
    setSelected(previous => ({ ...previous, [field]: null }));
    setActiveField(field);
    setError("");
  }

  function selectSuggestion(field: SearchField, value: PlaceSuggestion) {
    if (field === "origin") setOrigin(value.name);
    else setDestination(value.name);
    setSelected(previous => ({ ...previous, [field]: value }));
    setActiveField(null);
    setSuggestions([]);
    setSuggestionStatus("idle");
  }

  function suggestionsFor(field: SearchField) {
    const isOpen = activeField === field;
    const query = field === "origin" ? origin : destination;
    if (!isOpen || query.trim().length < 3) return null;
    return (
      <div className="biloo-explore-autocomplete" role="listbox" id={"biloo-place-options-" + field} aria-label={field === "origin" ? "Starting point suggestions" : "Destination suggestions"}>
        {suggestionStatus === "searching" ? (
          <p className="biloo-explore-suggestion-status" role="status">Finding places in Ethiopia…</p>
        ) : suggestionStatus === "error" ? (
          <p className="biloo-explore-suggestion-status" role="status">Suggestions unavailable. You can still enter a place manually.</p>
        ) : suggestions.length ? suggestions.map(item => (
          <button
            type="button"
            role="option"
            aria-selected={false}
            className="biloo-explore-suggestion"
            key={item.id}
            onPointerDown={event => event.preventDefault()}
            onClick={() => selectSuggestion(field, item)}
          >
            <span className="biloo-explore-suggestion-pin" aria-hidden="true">⌖</span>
            <span><strong>{item.name}</strong><small>{item.label}</small></span>
            <span className="biloo-explore-suggestion-arrow" aria-hidden="true">↗</span>
          </button>
        )) : (
          <p className="biloo-explore-suggestion-status" role="status">No places found. Try a nearby town or another spelling.</p>
        )}
      </div>
    );
  }

  async function calculateRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = origin.trim();
    const to = destination.trim();
    if (!from || !to) { setError("Enter both a starting point and a destination."); return; }
    if (from.toLocaleLowerCase() === to.toLocaleLowerCase()) {
      setError("Choose two different locations.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 18000);
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/route-explorer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin: from, destination: to, originPoint: selected.origin, destinationPoint: selected.destination }),
        signal: controller.signal,
        cache: "no-store",
      });
      const data: RouteResult & { message?: string } = await response.json();
      if (!response.ok || data.status !== "ready" || !Array.isArray(data.geometry)) {
        throw new Error(data.message || "No road route was found for these locations.");
      }
      if (!mountedRef.current || requestRef.current !== controller) return;
      currentRouteRef.current = data;
      setRoute(data);
      drawRoute(data);
      setToast("Your route is ready");
    } catch (cause) {
      if (!mountedRef.current || requestRef.current !== controller) return;
      setError(controller.signal.aborted
        ? "That request took too long. Check your connection and retry."
        : cause instanceof Error ? cause.message : "Unable to calculate this route.");
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller && mountedRef.current) {
        setLoading(false);
        requestRef.current = null;
      }
    }
  }

  function changeStyle(value: StyleName) {
    if (value === mapStyle) return;
    styleRef.current = value;
    setMapStyle(value);
  }

  function swapLocations() {
    setOrigin(destination);
    setDestination(origin);
    setSelected(previous => ({ origin: previous.destination, destination: previous.origin }));
    setActiveField(null);
    setError("");
  }

  function resetView() {
    const map = mapRef.current;
    if (!map) return;
    if (route) drawRoute(route);
    else map.flyTo({ center: INITIAL_CENTER, zoom: 6.6, duration: 450 });
  }

  async function shareRoute() {
    if (!route) return;
    const summary = "Biloo route: " + route.origin.name + " → " + route.destination.name +
      " · " + (route.distanceMeters / 1000).toFixed(1) + " km · " +
      formatDuration(route.durationSeconds);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Biloo route", text: summary });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(summary);
        setToast("Route details copied");
        return;
      }
      setToast("Sharing is not supported in this browser");
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      setToast("Could not share. Please try again.");
    }
  }

  return (
    <main className="biloo-explore-page">
      <header className="biloo-explore-topbar">
        <Link href="/" className="biloo-explore-back" aria-label="Back to Biloo Rider">
          <span aria-hidden="true">←</span>
        </Link>
        <img className="biloo-explore-monogram" src="/brand/biloo-mark.svg" alt="" aria-hidden="true" />
        <div className="biloo-explore-brandtext">
          <strong>BILOO <span>MAPS</span></strong>
          <small>Discover your next journey</small>
        </div>
        <span className="biloo-explore-top-tag"><i aria-hidden="true" /> ROUTE EXPLORER</span>
      </header>

      <section className="biloo-explore-workspace" data-panel-open={panelOpen ? "true" : "false"} aria-label="Biloo route planning workspace">
        <div className="biloo-explore-map" ref={containerRef} aria-label="Interactive Ethiopia road map" />
        {!mapReady && !mapError && (
          <div className="biloo-explore-map-loading" role="status">
            <span className="biloo-explore-spinner" aria-hidden="true" />
            Loading your map…
          </div>
        )}
        {mapError && (
          <div className="biloo-explore-map-error" role="status">
            <strong>Map connection</strong>
            <p>{mapError}</p>
          </div>
        )}

        <div className="biloo-explore-map-toolbar" aria-label="Map display options">
          <button type="button" className="biloo-explore-panel-toggle" aria-expanded={panelOpen} aria-controls="biloo-explore-route-panel" onClick={() => setPanelOpen(open => !open)}>{panelOpen ? "Hide planner ↑" : "Plan a route +"}</button>
          <div className="biloo-explore-map-style" role="group" aria-label="Map style">
            <button type="button" className={mapStyle === "streets" ? "is-active" : ""} aria-pressed={mapStyle === "streets"} onClick={() => changeStyle("streets")}>Streets</button>
            <button type="button" className={mapStyle === "satellite" ? "is-active" : ""} aria-pressed={mapStyle === "satellite"} onClick={() => changeStyle("satellite")}>Satellite</button>
            <button type="button" className={mapStyle === "night" ? "is-active" : ""} aria-pressed={mapStyle === "night"} onClick={() => changeStyle("night")}>Night</button>
          </div>
          <button type="button" className="biloo-explore-reset" onClick={resetView} aria-label="Fit route or reset map view" title="Reset map view">⌖</button>
        </div>

        <aside className="biloo-explore-panel" id="biloo-explore-route-panel" hidden={!panelOpen} aria-label="Route planner">
          <div className="biloo-explore-panel-accent" />
          <div className="biloo-explore-panel-head">
            <span className="biloo-explore-eyebrow"><i aria-hidden="true" /> YOUR ROAD, YOUR WAY</span>
            <h1>Explore more.<br /><span>Go anywhere.</span></h1>
            <p>Find the best way between places in Ethiopia, beautifully mapped.</p>
          </div>

          <form className="biloo-explore-form" onSubmit={calculateRoute}>
            <div className="biloo-explore-waypoints">
              <span className="biloo-explore-track" aria-hidden="true"><i /><b /></span>
              <div className="biloo-explore-field-wrap">
                <label className="biloo-explore-field">
                  <span>FROM</span>
                  <input name="origin" type="text" value={origin} onChange={event => editField("origin", event.target.value)} onFocus={() => setActiveField("origin")} onKeyDown={event => { if (event.key === "Escape") setActiveField(null); }} role="combobox" aria-autocomplete="list" aria-expanded={activeField === "origin" && origin.trim().length >= 3} aria-controls="biloo-place-options-origin" maxLength={100} placeholder="Enter a starting point" autoComplete="off" required />
                </label>
                {suggestionsFor("origin")}
              </div>
              <div className="biloo-explore-field-wrap">
                <label className="biloo-explore-field">
                  <span>TO</span>
                  <input name="destination" type="text" value={destination} onChange={event => editField("destination", event.target.value)} onFocus={() => setActiveField("destination")} onKeyDown={event => { if (event.key === "Escape") setActiveField(null); }} role="combobox" aria-autocomplete="list" aria-expanded={activeField === "destination" && destination.trim().length >= 3} aria-controls="biloo-place-options-destination" maxLength={100} placeholder="Where would you like to go?" autoComplete="off" required />
                </label>
                {suggestionsFor("destination")}
              </div>
              <button className="biloo-explore-swap" type="button" onClick={swapLocations} aria-label="Swap start and destination" title="Swap places">⇅</button>
            </div>
            <button className="biloo-explore-submit" type="submit" disabled={loading}>
              <span aria-hidden="true">↗</span>
              <span>{loading ? "Mapping your route…" : "Explore route"}</span>
              <span className="biloo-explore-button-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {error && <div className="biloo-explore-alert" role="alert">{error}</div>}

          {route ? (
            <section className="biloo-explore-result" aria-live="polite" aria-label="Route details">
              <div className="biloo-explore-result-top">
                <span><i aria-hidden="true" /> ROUTE FOUND</span>
                <button type="button" onClick={shareRoute}>Share ↗</button>
              </div>
              <div className="biloo-explore-placepair">
                <strong title={route.origin.name}>{route.origin.name}</strong>
                <span aria-hidden="true">→</span>
                <strong title={route.destination.name}>{route.destination.name}</strong>
              </div>
              <div className="biloo-explore-stats">
                <div><small>DISTANCE</small><strong>{(route.distanceMeters / 1000).toFixed(1)} <span>km</span></strong></div>
                <div><small>EST. DRIVE</small><strong>{formatDuration(route.durationSeconds)}</strong></div>
              </div>
            </section>
          ) : (
            <div className="biloo-explore-empty">
              <span aria-hidden="true" className="biloo-explore-empty-symbol">✦</span>
              <p>Your road trip starts with a destination. Enter two places to see the route, distance, and travel time.</p>
            </div>
          )}

          <div className="biloo-explore-panel-foot"><span className="biloo-explore-safety-dot" /> Powered by live Mapbox road data</div>
        </aside>
        {toast && <div className="biloo-explore-toast" role="status">{toast}</div>}
      </section>

      <footer className="biloo-explore-footer">
        <p>Map estimates are for planning only. Routes do not confirm Biloo driver or booking availability.</p>
        <Link href="/">Return to Biloo Rider <span aria-hidden="true">→</span></Link>
      </footer>
    </main>
  );
}

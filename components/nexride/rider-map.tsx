"use client";

import { useContext, useEffect, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapboxMap,
  Marker as MapboxMarker,
} from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import { Icon, LanguageContext, Spinner, useTranslation } from "./ui";
import { endpointName } from "./destination";
import type { Journey } from "../../lib/nexride-journey";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { withinNearbyDriverRadius } from "../../lib/nexride-nearby-vehicles";
import {
  formatDistance,
  formatDuration,
  type RouteResult,
  type TrafficLevel,
} from "../../lib/location";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

type MapStyleKey = "streets" | "satellite" | "dark";

const STYLE_URLS: Record<MapStyleKey, string> = {
  streets:
    process.env.NEXT_PUBLIC_MAPBOX_STYLE ||
    "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
};

const envNumber = (value: string | undefined, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const INITIAL_CENTER: [number, number] = [
  envNumber(process.env.NEXT_PUBLIC_MAPBOX_CENTER_LNG, 38.775),
  envNumber(process.env.NEXT_PUBLIC_MAPBOX_CENTER_LAT, 9.008),
];
const INITIAL_ZOOM = envNumber(process.env.NEXT_PUBLIC_MAPBOX_ZOOM, 13);
const INITIAL_PITCH = envNumber(process.env.NEXT_PUBLIC_MAPBOX_PITCH, 0);
const INITIAL_BEARING = envNumber(process.env.NEXT_PUBLIC_MAPBOX_BEARING, 0);

const emptyFeatureCollection = {
  type: "FeatureCollection" as const,
  features: [],
};

const accuracyPolygon = (
  lat: number,
  lng: number,
  radiusMeters: number,
  points = 56,
) => {
  const safeRadius = Math.max(8, Math.min(radiusMeters || 20, 500));
  const latitudeRadians = (lat * Math.PI) / 180;
  const latDelta = safeRadius / 111_320;
  const lngDelta =
    safeRadius / Math.max(1, 111_320 * Math.cos(latitudeRadians));
  const ring: [number, number][] = [];
  for (let index = 0; index <= points; index += 1) {
    const angle = (index / points) * Math.PI * 2;
    ring.push([
      lng + Math.cos(angle) * lngDelta,
      lat + Math.sin(angle) * latDelta,
    ]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [ring] },
  };
};

const endpointElement = (kind: "pickup" | "destination") => {
  const root = document.createElement("div");
  root.className = "nr-map-endpoint-marker";
  const pin = document.createElement("span");
  pin.className = `nr-pin-core ${kind}`;
  root.appendChild(pin);
  return root;
};

const heartbeatElement = (label: string) => {
  const root = document.createElement("div");
  root.className = "nr-live-location-marker";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", label);
  root.innerHTML =
    '<span class="nr-live-location-pulse nr-live-location-pulse-one" aria-hidden="true"></span>' +
    '<span class="nr-live-location-pulse nr-live-location-pulse-two" aria-hidden="true"></span>' +
    '<span class="nr-live-location-dot" aria-hidden="true"></span>';
  return root;
};

const searchAreaElement = () => {
  const root = document.createElement("div");
  root.className = "nr-pickup-search-area";
  root.innerHTML =
    '<span class="nr-search-area-fill"></span><span class="nr-search-area-pulse"></span>';
  return root;
};

type NearbyDriver = {
  key: string;
  lat: number;
  lng: number;
  updatedAt: string;
  distanceMeters: number;
};

const nearbyVehicleElement = (label: string) => {
  const root = document.createElement("div");
  root.className = "nr-nearby-car-marker";
  root.setAttribute("role", "img");
  root.setAttribute("aria-label", label);
  root.innerHTML =
    '<span class="nr-nearby-car-brand" aria-hidden="true">NexRide</span>' +
    '<span class="nr-nearby-car-body" aria-hidden="true">' +
    '<svg viewBox="0 0 56 36" focusable="false">' +
    '<path class="nr-nearby-car-shadow" d="M10 26c0 4 4 6 18 6s18-2 18-6H10Z"/>' +
    '<path class="nr-nearby-car-shell" d="M8 21.5 12.2 12c1.2-2.8 3.2-4.2 6.2-4.2h19.2c3 0 5 1.4 6.2 4.2L48 21.5v7.2c0 1.7-1.3 3-3 3h-2.5c-1.7 0-3-1.3-3-3v-.8h-23v.8c0 1.7-1.3 3-3 3H11c-1.7 0-3-1.3-3-3v-7.2Z"/>' +
    '<path class="nr-nearby-car-glass" d="m16.6 12.1-2.5 7h27.8l-2.5-7c-.4-1-1.2-1.5-2.3-1.5H18.9c-1.1 0-1.9.5-2.3 1.5Z"/>' +
    '<path class="nr-nearby-car-accent" d="M12.4 22.1h7.2v3.1h-7.2zm24 0h7.2v3.1h-7.2z"/>' +
    '<path class="nr-nearby-car-grille" d="M22.2 24.2h11.6c.8 0 1.4.6 1.4 1.4v.7H20.8v-.7c0-.8.6-1.4 1.4-1.4Z"/>' +
    "</svg></span>";
  return root;
};

const routeCollection = (
  routes: RouteResult[],
  selectedIndex: number,
) => ({
  type: "FeatureCollection" as const,
  features: routes.flatMap((route, routeIndex) =>
    route.geometry?.length
      ? [
          {
            type: "Feature" as const,
            properties: {
              routeIndex,
              selected: routeIndex === selectedIndex,
            },
            geometry: {
              type: "LineString" as const,
              coordinates: route.geometry.map(
                ([lat, lng]) => [lng, lat] as [number, number],
              ),
            },
          },
        ]
      : [],
  ),
});

const segmentCollection = (route: RouteResult | undefined) => ({
  type: "FeatureCollection" as const,
  features: (route?.segments || []).map((segment, index) => ({
    type: "Feature" as const,
    id: index,
    properties: {
      congestion: segment.congestion || "unknown",
    },
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [segment.from[1], segment.from[0]],
        [segment.to[1], segment.to[0]],
      ],
    },
  })),
});

function syncRoutes(map: MapboxMap, journey: Journey | undefined) {
  if (!map.isStyleLoaded()) return;
  const state = journey?.routeState;
  const routes =
    state?.status === "ready"
      ? state.alternatives?.length
        ? state.alternatives
        : state.route
          ? [state.route]
          : []
      : [];
  const selectedIndex =
    state?.status === "ready" ? state.selectedIndex || 0 : 0;
  const selectedRoute = routes[selectedIndex];
  const routesData = routeCollection(routes, selectedIndex);
  const segmentsData = segmentCollection(selectedRoute);

  const routeSource = map.getSource("nexride-routes") as
    | GeoJSONSource
    | undefined;
  if (routeSource) routeSource.setData(routesData);
  else if (routes.length)
    map.addSource("nexride-routes", {
      type: "geojson",
      data: routesData,
    });

  const segmentSource = map.getSource("nexride-route-segments") as
    | GeoJSONSource
    | undefined;
  if (segmentSource) segmentSource.setData(segmentsData);
  else if (routes.length)
    map.addSource("nexride-route-segments", {
      type: "geojson",
      data: segmentsData,
    });

  if (routes.length && !map.getLayer("nexride-route-casing")) {
    map.addLayer({
      id: "nexride-route-casing",
      type: "line",
      source: "nexride-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "case",
          ["boolean", ["get", "selected"], false],
          9,
          7,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0.96,
          0.62,
        ],
      },
    });
  }

  if (routes.length && !map.getLayer("nexride-route-lines")) {
    map.addLayer({
      id: "nexride-route-lines",
      type: "line",
      source: "nexride-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "case",
          ["boolean", ["get", "selected"], false],
          "#246bc6",
          "#7f8d98",
        ],
        "line-width": [
          "case",
          ["boolean", ["get", "selected"], false],
          5,
          4,
        ],
        "line-opacity": [
          "case",
          ["boolean", ["get", "selected"], false],
          0.96,
          0.52,
        ],
      },
    });
  }

  if (routes.length && !map.getLayer("nexride-route-congestion")) {
    map.addLayer({
      id: "nexride-route-congestion",
      type: "line",
      source: "nexride-route-segments",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "congestion"],
          "low",
          "#18a558",
          "moderate",
          "#e6b800",
          "heavy",
          "#f08a24",
          "severe",
          "#dc3f45",
          "#246bc6",
        ],
        "line-width": 5.5,
        "line-opacity": 0.98,
      },
    });
  }

  if (routes.length && !map.getLayer("nexride-route-hitbox")) {
    map.addLayer({
      id: "nexride-route-hitbox",
      type: "line",
      source: "nexride-routes",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#000000",
        "line-width": 22,
        "line-opacity": 0,
      },
    });
  }
}

function firstSymbolLayer(map: MapboxMap) {
  return map
    .getStyle()
    .layers?.find((layer) => layer.type === "symbol")?.id;
}

function addTraffic(map: MapboxMap) {
  if (!map.isStyleLoaded()) return;
  if (!map.getSource("nexride-traffic"))
    map.addSource("nexride-traffic", {
      type: "vector",
      url: "mapbox://mapbox.mapbox-traffic-v1",
    });
  if (!map.getLayer("nexride-live-traffic")) {
    map.addLayer(
      {
        id: "nexride-live-traffic",
        type: "line",
        source: "nexride-traffic",
        "source-layer": "traffic",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "match",
            ["get", "congestion"],
            "low",
            "#18a558",
            "moderate",
            "#e6b800",
            "heavy",
            "#f08a24",
            "severe",
            "#dc3f45",
            "rgba(127,141,152,.38)",
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            1.5,
            12,
            2.5,
            16,
            5,
          ],
          "line-opacity": 0.78,
        },
      },
      firstSymbolLayer(map),
    );
  }
}

function removeTraffic(map: MapboxMap) {
  if (map.getLayer("nexride-live-traffic"))
    map.removeLayer("nexride-live-traffic");
  if (map.getSource("nexride-traffic"))
    map.removeSource("nexride-traffic");
}

function refreshTraffic(map: MapboxMap) {
  if (!map.isStyleLoaded()) return;
  removeTraffic(map);
  addTraffic(map);
}

function syncAccuracy(
  map: MapboxMap,
  position: RiderLocation | null,
  status: LocationStatus,
) {
  if (!map.isStyleLoaded()) return;
  const data =
    position && status === "ready"
      ? accuracyPolygon(position.lat, position.lng, position.accuracy)
      : emptyFeatureCollection;
  const source = map.getSource("nexride-live-accuracy") as
    | GeoJSONSource
    | undefined;

  if (source) {
    source.setData(data);
    return;
  }

  if (!position || status !== "ready") return;
  map.addSource("nexride-live-accuracy", { type: "geojson", data });
  map.addLayer({
    id: "nexride-live-accuracy-fill",
    type: "fill",
    source: "nexride-live-accuracy",
    paint: {
      "fill-color": "#078930",
      "fill-opacity": 0.12,
    },
  });
  map.addLayer({
    id: "nexride-live-accuracy-outline",
    type: "line",
    source: "nexride-live-accuracy",
    paint: {
      "line-color": "#078930",
      "line-opacity": 0.22,
      "line-width": 1,
    },
  });
}

function fitJourney(
  map: MapboxMap,
  journey: Journey | undefined,
  rideLabel: boolean,
) {
  const pickup = journey?.pickup;
  const destination = journey?.destination;
  if (!pickup?.confirmed || !destination?.confirmed) return;

  const geometry =
    journey?.routeState.status === "ready"
      ? journey.routeState.route?.geometry
      : undefined;
  const points =
    geometry?.length
      ? geometry
      : [
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ];

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lat, lng] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }

  const container = map.getContainer();
  const canvas = container.getBoundingClientRect();
  const panel = container.closest(".rider-map-flow.nr-polished-wrapper")
    ?.querySelector<HTMLElement>(".nr-rider-flow-panel")?.getBoundingClientRect();
  const padding = { top: rideLabel ? 88 : 68, right: 72, bottom: 54, left: 28 };
  // Keep route endpoints in the exposed map beside or above the ride panel.
  if (panel && panel.top < canvas.bottom && panel.right > canvas.left) {
    if (window.innerWidth > 800) {
      padding.left = Math.min(Math.max(28, panel.right - canvas.left + 24), Math.max(28, canvas.width - padding.right - 48));
    } else {
      padding.bottom = Math.min(Math.max(54, canvas.bottom - panel.top + 24), Math.max(54, canvas.height - padding.top - 48));
    }
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding,
      maxZoom: 16,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 320,
    },
  );
}

const normalizedBearing = (bearing: number) => {
  const normalized = ((bearing + 180) % 360 + 360) % 360 - 180;
  return normalized;
};

export function RiderMap({
  position,
  status,
  locate,
  recenter,
  initials,
  onProfile,
  journey,
  rideLabel = false,
  back,
  locked = false,
  searching = false,
  readOnly = false,
  topLabel,
  showProfile = true,
  preferredStyle,
  showSearch = true,
  showNativeControls = true,
  showNearbyDrivers = false,
  onStartRoute,
}: {
  position: RiderLocation | null;
  status: LocationStatus;
  locate: () => void;
  recenter: number;
  initials: string;
  onProfile: () => void;
  journey?: Journey;
  rideLabel?: boolean;
  back?: () => void;
  locked?: boolean;
  searching?: boolean;
  readOnly?: boolean;
  topLabel?: string;
  showProfile?: boolean;
  preferredStyle?: "streets" | "dark";
  showSearch?: boolean;
  showNativeControls?: boolean;
  showNearbyDrivers?: boolean;
  onStartRoute?: () => void;
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const liveMarker = useRef<MapboxMarker | null>(null);
  const liveMarkerAnimation = useRef<number | null>(null);
  const liveMarkerLngLat = useRef<[number, number] | null>(null);
  const pickupMarker = useRef<MapboxMarker | null>(null);
  const destinationMarker = useRef<MapboxMarker | null>(null);
  const searchMarker = useRef<MapboxMarker | null>(null);
  const nearbyDriverMarkers = useRef(
    new Map<
      string,
      {
        marker: MapboxMarker;
        lngLat: [number, number];
        animation: number | null;
      }
    >(),
  );
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const journeyRef = useRef(journey);
  const positionRef = useRef(position);
  const statusRef = useRef(status);
  const rideLabelRef = useRef(rideLabel);
  const readOnlyRef = useRef(readOnly);
  const trafficVisibleRef = useRef(false);
  const lastTrafficRefresh = useRef(0);
  const lastFastestDuration = useRef<number | null>(null);
  journeyRef.current = journey;
  positionRef.current = position;
  statusRef.current = status;
  rideLabelRef.current = rideLabel;
  readOnlyRef.current = readOnly;

  const manualView = useRef(false);
  const mapGestureBlocked = useRef(false);
  const suppressMapClickUntil = useRef(0);
  const loadedRef = useRef(false);
  const lastRecenter = useRef(recenter);
  const activeStyleRef = useRef<MapStyleKey>(preferredStyle || "streets");

  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>(preferredStyle || "streets");
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [bearing, setBearing] = useState(0);
  const [trafficVisible, setTrafficVisible] = useState(true);
  const [fasterNotice, setFasterNotice] = useState<number | null>(null);
  const [gpsStale, setGpsStale] = useState(false);
  const [nearbyDrivers, setNearbyDrivers] = useState<NearbyDriver[]>([]);
  trafficVisibleRef.current = trafficVisible;

  const route =
    journey?.routeState.status === "ready"
      ? journey.routeState.route
      : undefined;
  const pickup = journey?.pickup;
  const destination = journey?.destination;
  const geometry = route?.geometry;
  const trafficLabel = route?.traffic
    ? t(
        route.traffic.level === "low"
          ? "trafficLow"
          : route.traffic.level === "moderate"
            ? "trafficModerate"
            : route.traffic.level === "heavy"
              ? "trafficHeavy"
              : "trafficSevere",
      )
    : "";
  const showCompass = Math.abs(normalizedBearing(bearing)) > 2;

  useEffect(() => {
    let cancelled = false;
    setMapStatus("loading");
    loadedRef.current = false;

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
        style: STYLE_URLS[preferredStyle || styleKey],
        center: INITIAL_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: INITIAL_PITCH,
        bearing: INITIAL_BEARING,
        attributionControl: true,
        logoPosition: "bottom-left",
        cooperativeGestures: false,
      });
      mapRef.current = map;
      activeStyleRef.current = styleKey;

      map.touchZoomRotate.enable();
      map.dragPan.enable();
      map.keyboard.enable();
      map.doubleClickZoom.enable();
      map.scrollZoom.enable();

      if (showNativeControls) {
        const navigation = new mapboxgl.default.NavigationControl({
          showCompass: false,
          showZoom: true,
        });
        const fullscreen = new mapboxgl.default.FullscreenControl({
          container:
            container.current.closest<HTMLElement>(".nr-rider-map-surface") ||
            undefined,
        });
        map.addControl(navigation, "top-right");
        map.addControl(fullscreen, "top-right");
      }

      const scale = new mapboxgl.default.ScaleControl({
        maxWidth: 92,
        unit: "metric",
      });
      map.addControl(scale, "bottom-left");

      if (showSearch) {
        const geocoder = new MapboxGeocoder({
          accessToken: token,
          mapboxgl:
            mapboxgl.default as unknown as typeof import("mapbox-gl"),
          marker: false,
          countries: "et",
          language,
          placeholder:
            language === "am" ? "ቦታ ይፈልጉ" : "Search Addis Ababa",
          bbox: [38.66, 8.84, 38.91, 9.11],
          proximity: { longitude: 38.775, latitude: 9.008 },
          useBrowserFocus: true,
        });
        map.addControl(geocoder, "top-left");

        geocoder.on("result", (event: any) => {
          const result = event?.result;
          const coordinates =
            Array.isArray(result?.center) && result.center.length >= 2
              ? result.center
              : result?.geometry?.type === "Point" &&
                  Array.isArray(result.geometry.coordinates)
                ? result.geometry.coordinates
                : null;
          const plan = journeyRef.current;
          if (
            !coordinates ||
            !plan ||
            readOnlyRef.current ||
            !Number.isFinite(Number(coordinates[0])) ||
            !Number.isFinite(Number(coordinates[1]))
          )
            return;
          plan.select("destination", {
            lng: Number(coordinates[0]),
            lat: Number(coordinates[1]),
            name:
              typeof result?.text === "string"
                ? result.text
                : typeof result?.place_name === "string"
                  ? result.place_name
                  : "",
            address:
              typeof result?.place_name === "string"
                ? result.place_name
                : "",
            source: "provider",
            confirmed: true,
          });
        });
      }

      const syncStyleData = () => {
        if (!map.isStyleLoaded()) return;
        syncRoutes(map, journeyRef.current);
        syncAccuracy(map, positionRef.current, statusRef.current);
        if (trafficVisibleRef.current) addTraffic(map);
      };

      map.on("style.load", () => {
        if (cancelled) return;
        syncStyleData();
        setMapStatus("ready");
      });

      map.on("load", () => {
        if (cancelled) return;
        loadedRef.current = true;
        setMounted(true);
        setMapStatus("ready");
        syncStyleData();
        setBearing(map.getBearing());

        const input = container.current
          ?.closest(".nr-rider-map-surface")
          ?.querySelector<HTMLInputElement>(".mapboxgl-ctrl-geocoder--input");
        input?.setAttribute(
          "aria-label",
          language === "am" ? "ቦታ ይፈልጉ" : "Search places",
        );

        if (
          journeyRef.current?.pickup?.confirmed &&
          journeyRef.current.destination?.confirmed
        ) {
          fitJourney(map, journeyRef.current, rideLabelRef.current);
        } else if (
          positionRef.current &&
          statusRef.current === "ready"
        ) {
          map.jumpTo({
            center: [
              positionRef.current.lng,
              positionRef.current.lat,
            ],
            zoom: 16,
          });
        }
      });

      map.on("error", () => {
        if (!loadedRef.current && !cancelled) setMapStatus("unavailable");
      });

      const markManual = (event: any) => {
        if (event?.originalEvent) manualView.current = true;
      };
      map.on("dragstart", markManual);
      map.on("zoomstart", markManual);
      map.on("rotatestart", markManual);
      map.on("rotate", () => setBearing(map.getBearing()));

      map.on("click", (event) => {
        if (
          mapGestureBlocked.current ||
          performance.now() < suppressMapClickUntil.current
        )
          return;

        if (map.getLayer("nexride-route-hitbox")) {
          const routeFeature = map.queryRenderedFeatures(event.point, {
            layers: ["nexride-route-hitbox"],
          })[0];
          const routeIndex = Number(routeFeature?.properties?.routeIndex);
          if (Number.isInteger(routeIndex) && routeIndex >= 0) {
            suppressMapClickUntil.current = performance.now() + 350;
            journeyRef.current?.selectRoute(routeIndex);
            return;
          }
        }

        const plan = journeyRef.current;
        if (!plan || readOnlyRef.current) return;

        if (plan.pinMode) {
          plan.setPin(plan.pinMode, {
            lat: event.lngLat.lat,
            lng: event.lngLat.lng,
          });
          return;
        }

        if (!plan.pickup?.confirmed) {
          plan.select("pickup", {
            lat: event.lngLat.lat,
            lng: event.lngLat.lng,
            name: "",
            address: `${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`,
            source: "pin",
            confirmed: true,
          });
          return;
        }

        if (!plan.destination?.confirmed)
          plan.select("destination", {
            lat: event.lngLat.lat,
            lng: event.lngLat.lng,
            name: "",
            address: `${event.lngLat.lat.toFixed(5)}, ${event.lngLat.lng.toFixed(5)}`,
            source: "pin",
            confirmed: true,
          });
      });

      map.on("idle", () => {
        if (!trafficVisibleRef.current || !map.isStyleLoaded()) return;
        const now = Date.now();
        if (now - lastTrafficRefresh.current < 30_000) return;
        lastTrafficRefresh.current = now;
        refreshTraffic(map);
      });

      resizeObserver.current = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.current.observe(container.current);
    };

    void boot().catch(() => {
      if (!cancelled) setMapStatus("unavailable");
    });

    return () => {
      cancelled = true;
      resizeObserver.current?.disconnect();
      resizeObserver.current = null;
      pickupMarker.current?.remove();
      destinationMarker.current?.remove();
      if (liveMarkerAnimation.current !== null) {
        cancelAnimationFrame(liveMarkerAnimation.current);
        liveMarkerAnimation.current = null;
      }
      liveMarker.current?.remove();
      liveMarkerLngLat.current = null;
      searchMarker.current?.remove();
      for (const entry of nearbyDriverMarkers.current.values()) {
        if (entry.animation !== null) cancelAnimationFrame(entry.animation);
        entry.marker.remove();
      }
      nearbyDriverMarkers.current.clear();
      pickupMarker.current = null;
      destinationMarker.current = null;
      liveMarker.current = null;
      searchMarker.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMounted(false);
      loadedRef.current = false;
    };
  }, [attempt, language, showSearch, showNativeControls]);

  useEffect(() => {
    if (preferredStyle) setStyleKey(preferredStyle);
  }, [preferredStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map) return;
    if (activeStyleRef.current === styleKey) return;
    activeStyleRef.current = styleKey;
    setMapStatus("loading");
    setLayerMenuOpen(false);
    map.setStyle(STYLE_URLS[styleKey]);
  }, [styleKey, mounted]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map || !map.isStyleLoaded()) return;
    if (trafficVisible) {
      addTraffic(map);
      lastTrafficRefresh.current = Date.now();
    } else {
      removeTraffic(map);
    }
  }, [trafficVisible, mounted, styleKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map || !container.current) return;
    const stage = container.current.closest<HTMLElement>(".nr-stage");
    if (!stage) return;
    let activePointers = 0;

    const setEnabled = (enabled: boolean) => {
      const action = enabled ? "enable" : "disable";
      map.dragPan[action]();
      map.touchZoomRotate[action]();
      map.doubleClickZoom[action]();
      map.scrollZoom[action]();
      map.boxZoom[action]();
      map.keyboard[action]();
      mapGestureBlocked.current = !enabled;
    };

    const insidePanel = (clientX: number, clientY: number) => {
      const panel = stage.querySelector<HTMLElement>(".nr-rider-flow-panel");
      if (!panel) return false;
      const rect = panel.getBoundingClientRect();
      return (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      );
    };

    const down = (event: PointerEvent) => {
      if (!insidePanel(event.clientX, event.clientY)) return;
      activePointers += 1;
      suppressMapClickUntil.current = performance.now() + 800;
      setEnabled(false);
    };
    const finish = () => {
      if (!mapGestureBlocked.current) return;
      activePointers = Math.max(0, activePointers - 1);
      if (activePointers > 0) return;
      suppressMapClickUntil.current = performance.now() + 500;
      window.setTimeout(() => {
        if (activePointers === 0) setEnabled(true);
      }, 0);
    };

    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", finish, true);
      document.removeEventListener("pointercancel", finish, true);
      setEnabled(true);
    };
  }, [mounted]);

  useEffect(() => {
    if (!position || status !== "ready") {
      setGpsStale(false);
      return;
    }

    const age = Math.max(0, Date.now() - position.timestamp);
    if (age >= 15_000) {
      setGpsStale(true);
      return;
    }

    setGpsStale(false);
    const timer = window.setTimeout(
      () => setGpsStale(true),
      Math.max(0, 15_000 - age),
    );
    return () => window.clearTimeout(timer);
  }, [position?.timestamp, status]);

  useEffect(() => {
    const element = liveMarker.current?.getElement();
    if (!element) return;
    element.classList.toggle("is-stale", gpsStale);
  }, [gpsStale, position, mounted]);

  useEffect(() => {
    if (!mounted) return;

    const syncAnimationState = () => {
      const element = liveMarker.current?.getElement();
      if (!element) return;
      const paused =
        document.hidden ||
        document.documentElement.hasAttribute("data-nr-data-saver");
      element.classList.toggle("is-paused", paused);
    };

    syncAnimationState();
    document.addEventListener("visibilitychange", syncAnimationState);
    const observer = new MutationObserver(syncAnimationState);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-nr-data-saver"],
    });

    return () => {
      document.removeEventListener("visibilitychange", syncAnimationState);
      observer.disconnect();
    };
  }, [mounted, position]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map || !map.isStyleLoaded()) return;
    syncAccuracy(map, position, status);

    if (!position || status !== "ready") {
      if (liveMarkerAnimation.current !== null) {
        cancelAnimationFrame(liveMarkerAnimation.current);
        liveMarkerAnimation.current = null;
      }
      liveMarker.current?.remove();
      liveMarker.current = null;
      liveMarkerLngLat.current = null;
      return;
    }

    void import("mapbox-gl").then((mapboxgl) => {
      const currentMap = mapRef.current;
      if (!currentMap) return;

      const target: [number, number] = [position.lng, position.lat];
      const isNew = !liveMarker.current;

      if (!liveMarker.current) {
        const markerElement = heartbeatElement(
          language === "am" ? "የእርስዎ አካባቢ" : "Your location",
        );
        markerElement.classList.toggle("is-stale", gpsStale);
        markerElement.classList.toggle(
          "is-paused",
          document.hidden ||
            document.documentElement.hasAttribute("data-nr-data-saver"),
        );

        liveMarker.current = new mapboxgl.default.Marker({
          element: markerElement,
          anchor: "center",
        })
          .setLngLat(target)
          .addTo(currentMap);
        liveMarkerLngLat.current = target;
      } else {
        const from = liveMarkerLngLat.current || target;
        if (liveMarkerAnimation.current !== null) {
          cancelAnimationFrame(liveMarkerAnimation.current);
          liveMarkerAnimation.current = null;
        }

        const reducedMotion = matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const duration = reducedMotion ? 0 : 400;

        if (duration === 0) {
          liveMarker.current.setLngLat(target);
          liveMarkerLngLat.current = target;
        } else {
          const startedAt = performance.now();
          const animate = (now: number) => {
            const marker = liveMarker.current;
            if (!marker) return;
            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            const next: [number, number] = [
              from[0] + (target[0] - from[0]) * eased,
              from[1] + (target[1] - from[1]) * eased,
            ];
            marker.setLngLat(next);
            liveMarkerLngLat.current = next;
            if (progress < 1) {
              liveMarkerAnimation.current = requestAnimationFrame(animate);
            } else {
              liveMarkerAnimation.current = null;
              liveMarkerLngLat.current = target;
            }
          };
          liveMarkerAnimation.current = requestAnimationFrame(animate);
        }
      }

      const recenterChanged = lastRecenter.current !== recenter;
      lastRecenter.current = recenter;

      if (isNew || recenterChanged) manualView.current = false;

      if (!manualView.current) {
        currentMap.easeTo({
          center: target,
          zoom:
            isNew || recenterChanged
              ? Math.max(currentMap.getZoom(), 16)
              : currentMap.getZoom(),
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : isNew || recenterChanged
              ? 300
              : 400,
        });
      }
    });
  }, [
    position?.lat,
    position?.lng,
    position?.accuracy,
    position?.timestamp,
    status,
    recenter,
    mounted,
    language,
    gpsStale,
  ]);

  useEffect(() => {
    if (!showNearbyDrivers || !mounted || status !== "ready" || !position) {
      setNearbyDrivers([]);
      return;
    }

    let active = true;
    let controller: AbortController | null = null;

    const loadNearbyDrivers = async () => {
      // A slow mobile connection must not cause the next 3-second poll to
      // abort an in-progress result. The request is cancelled on unmount.
      if (controller) return;
      const pending = new AbortController();
      controller = pending;
      try {
        const params = new URLSearchParams({
          lat: String(position.lat),
          lng: String(position.lng),
        });
        const response = await nexrideApiFetch(
          "/api/rider/nearby-drivers?" + params.toString(),
          { cache: "no-store", signal: pending.signal },
        );
        if (!active) return;
        if (!response.ok) {
          // Keep only still-fresh markers during transient server failures.
          setNearbyDrivers((current) => current.filter(
            (item) => Date.now() - Date.parse(item.updatedAt) <= 60_000,
          ));
          return;
        }
        const payload = await response.json();
        const raw = Array.isArray(payload?.vehicles) ? payload.vehicles : [];
        const next = raw
          .map((item: Record<string, unknown>) => ({
            key: typeof item.key === "string" ? item.key : "",
            lat: Number(item.lat),
            lng: Number(item.lng),
            updatedAt:
              typeof item.updatedAt === "string" ? item.updatedAt : "",
            distanceMeters: Number(item.distanceMeters),
          }))
          .filter(
            (item: NearbyDriver) =>
              !!item.key &&
              Number.isFinite(item.lat) &&
              Math.abs(item.lat) <= 90 &&
              Number.isFinite(item.lng) &&
              Math.abs(item.lng) <= 180 &&
              Number.isFinite(item.distanceMeters) &&
              withinNearbyDriverRadius(item.distanceMeters) &&
              Number.isFinite(Date.parse(item.updatedAt)) &&
              Date.now() - Date.parse(item.updatedAt) <= 60_000,
          )
          .slice(0, 10);
        setNearbyDrivers((current) => {
          if (current.length === next.length && current.every((item, index) =>
            item.key === next[index].key &&
            item.lat === next[index].lat &&
            item.lng === next[index].lng &&
            item.updatedAt === next[index].updatedAt
          )) return current;
          return next;
        });
      } catch (error) {
        if (
          active &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          setNearbyDrivers((current) => current.filter(
            (item) => Date.now() - Date.parse(item.updatedAt) <= 60_000,
          ));
        }
      } finally {
        if (controller === pending) controller = null;
      }
    };

    void loadNearbyDrivers();
    // New Online drivers should appear on the Rider home map promptly.
    // Keep server-filtered eligibility, busy-trip checks and location freshness
    // authoritative rather than retaining optimistic/fake vehicle markers.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void loadNearbyDrivers();
      }
    }, 3_000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void loadNearbyDrivers();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [
    showNearbyDrivers,
    mounted,
    status,
    position?.lat,
    position?.lng,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map) return;

    if (!showNearbyDrivers) {
      for (const entry of nearbyDriverMarkers.current.values()) {
        if (entry.animation !== null) cancelAnimationFrame(entry.animation);
        entry.marker.remove();
      }
      nearbyDriverMarkers.current.clear();
      return;
    }

    let disposed = false;
    void import("mapbox-gl").then((mapboxgl) => {
      if (disposed || !mapRef.current) return;
      const currentMap = mapRef.current;
      const visible = new Set(nearbyDrivers.map((driver) => driver.key));

      for (const [key, entry] of nearbyDriverMarkers.current) {
        if (visible.has(key)) continue;
        if (entry.animation !== null) cancelAnimationFrame(entry.animation);
        entry.marker.remove();
        nearbyDriverMarkers.current.delete(key);
      }

      const reducedMotion = matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      for (const driver of nearbyDrivers) {
        const target: [number, number] = [driver.lng, driver.lat];
        const existing = nearbyDriverMarkers.current.get(driver.key);

        if (!existing) {
          const marker = new mapboxgl.default.Marker({
            element: nearbyVehicleElement(
              language === "am"
                ? "NexRide ሹፌር በአቅራቢያ"
                : "NexRide driver nearby",
            ),
            anchor: "bottom",
          })
            .setLngLat(target)
            .addTo(currentMap);
          nearbyDriverMarkers.current.set(driver.key, {
            marker,
            lngLat: target,
            animation: null,
          });
          continue;
        }

        if (
          existing.lngLat[0] === target[0] &&
          existing.lngLat[1] === target[1]
        )
          continue;

        if (existing.animation !== null)
          cancelAnimationFrame(existing.animation);

        if (reducedMotion) {
          existing.marker.setLngLat(target);
          existing.lngLat = target;
          existing.animation = null;
          continue;
        }

        const from = existing.lngLat;
        const startedAt = performance.now();
        const duration = 720;

        const animate = (now: number) => {
          const current = nearbyDriverMarkers.current.get(driver.key);
          if (!current) return;
          const progress = Math.min(1, (now - startedAt) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const next: [number, number] = [
            from[0] + (target[0] - from[0]) * eased,
            from[1] + (target[1] - from[1]) * eased,
          ];
          current.marker.setLngLat(next);
          current.lngLat = next;
          if (progress < 1) {
            current.animation = requestAnimationFrame(animate);
          } else {
            current.animation = null;
            current.lngLat = target;
          }
        };

        existing.animation = requestAnimationFrame(animate);
      }
    });

    return () => {
      disposed = true;
    };
  }, [nearbyDrivers, showNearbyDrivers, mounted, language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map) return;

    pickupMarker.current?.remove();
    destinationMarker.current?.remove();
    pickupMarker.current = null;
    destinationMarker.current = null;

    void import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      if (pickup) {
        const marker = new mapboxgl.default.Marker({
          element: endpointElement("pickup"),
          draggable: !readOnly,
          anchor: "center",
        })
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(map);
        if (!readOnly) {
          marker.on("dragstart", () => journeyRef.current?.invalidatePickup());
          marker.on("dragend", () => {
            const point = marker.getLngLat();
            journeyRef.current?.setPin("pickup", {
              lat: point.lat,
              lng: point.lng,
            });
          });
        }
        pickupMarker.current = marker;
      }

      if (destination)
        destinationMarker.current = new mapboxgl.default.Marker({
          element: endpointElement("destination"),
          draggable: false,
          anchor: "center",
        })
          .setLngLat([destination.lng, destination.lat])
          .addTo(map);
    });
  }, [
    pickup?.lat,
    pickup?.lng,
    destination?.lat,
    destination?.lng,
    readOnly,
    mounted,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map || !map.isStyleLoaded()) return;
    syncRoutes(map, journey);

    if (
      !manualView.current &&
      pickup?.confirmed &&
      destination?.confirmed
    ) {
      fitJourney(map, journey, rideLabel);
    }
  }, [
    geometry,
    pickup?.lat,
    pickup?.lng,
    pickup?.confirmed,
    destination?.lat,
    destination?.lng,
    destination?.confirmed,
    rideLabel,
    mounted,
  ]);

  useEffect(() => {
    const state = journey?.routeState;
    if (state?.status !== "ready" || !state.updatedAt) return;
    const routes = state.alternatives?.length
      ? state.alternatives
      : state.route
        ? [state.route]
        : [];
    const fastest = routes[0];
    if (!fastest) return;

    const previousFastest = lastFastestDuration.current;
    lastFastestDuration.current = fastest.durationSeconds;
    if (
      previousFastest !== null &&
      fastest.durationSeconds + 30 < previousFastest
    ) {
      setFasterNotice(previousFastest - fastest.durationSeconds);
      const timer = window.setTimeout(() => setFasterNotice(null), 8000);
      return () => window.clearTimeout(timer);
    }
  }, [journey?.routeState.updatedAt]);

  useEffect(() => {
    searchMarker.current?.remove();
    searchMarker.current = null;
    const map = mapRef.current;
    if (!mounted || !map || !searching || !pickup) return;
    void import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      searchMarker.current = new mapboxgl.default.Marker({
        element: searchAreaElement(),
        anchor: "center",
      })
        .setLngLat([pickup.lng, pickup.lat])
        .addTo(map);
    });
    return () => {
      searchMarker.current?.remove();
      searchMarker.current = null;
    };
  }, [searching, pickup?.lat, pickup?.lng, mounted]);

  return (
    <section
      className={`nr-rider-map-surface nr-mapbox-surface ${route ? "nr-map-has-route" : ""}`}
      inert={locked}
      aria-label={t("streetMap")}
      data-map-status={mapStatus}
    >
      <div
        ref={container}
        className="nr-geographic-map nr-mapbox-map"
        role="region"
        aria-label={t("streetMap")}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !journey?.pinMode || !mapRef.current)
            return;
          const center = mapRef.current.getCenter();
          journey.setPin(journey.pinMode, {
            lat: center.lat,
            lng: center.lng,
          });
        }}
      />

      <div
        className="nr-map-control-stack"
        aria-label={language === "am" ? "የካርታ መቆጣጠሪያዎች" : "Map controls"}
      >
        <button
          type="button"
          className="nr-map-touch-control"
          aria-label={t("recenter")}
          title={t("recenter")}
          onClick={() => {
            manualView.current = false;
            locate();
            if (position && mapRef.current)
              mapRef.current.easeTo({
                center: [position.lng, position.lat],
                zoom: Math.max(mapRef.current.getZoom(), 16),
                duration: 280,
              });
          }}
          disabled={status === "loading"}
        >
          {status === "loading" ? <Spinner /> : <Icon name="locate" size={21} />}
        </button>

        <button
          type="button"
          className="nr-map-touch-control nr-map-traffic-toggle"
          aria-label={
            language === "am"
              ? trafficVisible
                ? "ቀጥታ ትራፊክ ደብቅ"
                : "ቀጥታ ትራፊክ አሳይ"
              : trafficVisible
                ? "Hide live traffic"
                : "Show live traffic"
          }
          aria-pressed={trafficVisible}
          title={trafficVisible ? "Hide live traffic" : "Show live traffic"}
          onClick={() => setTrafficVisible((visible) => !visible)}
        >
          <span className="nr-traffic-control-icon" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </button>

        <button
          type="button"
          className="nr-map-touch-control"
          aria-label={language === "am" ? "የካርታ ቅጥ" : "Map style"}
          aria-expanded={layerMenuOpen}
          aria-controls="nr-map-layer-menu"
          onClick={() => setLayerMenuOpen((open) => !open)}
        >
          <Icon name="globe" size={21} />
        </button>

        {showCompass && (
          <button
            type="button"
            className="nr-map-touch-control nr-map-compass-control"
            aria-label={language === "am" ? "ካርታውን ወደ ሰሜን መልስ" : "Reset map north"}
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              map.easeTo({
                bearing: 0,
                duration: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? 0
                  : 220,
              });
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                transform: `rotate(${-bearing}deg)`,
              }}
            >
              <Icon name="navigation" size={21} />
            </span>
          </button>
        )}
      </div>

      {layerMenuOpen && (
        <div
          id="nr-map-layer-menu"
          className="nr-map-layer-menu"
          role="menu"
          aria-label={language === "am" ? "የካርታ ቅጥ ይምረጡ" : "Choose map style"}
        >
          {(["streets", "satellite", "dark"] as MapStyleKey[]).map((key) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={styleKey === key}
              onClick={() => setStyleKey(key)}
            >
              <span>
                {key === "streets"
                  ? language === "am"
                    ? "መንገድ"
                    : "Streets"
                  : key === "satellite"
                    ? language === "am"
                      ? "ሳተላይት"
                      : "Satellite"
                    : language === "am"
                      ? "ጨለማ"
                      : "Dark"}
              </span>
              {styleKey === key && <Icon name="check" size={17} />}
            </button>
          ))}
        </div>
      )}

      {status === "denied" && (
        <div className="nr-location-permission" role="alert">
          <Icon name="locate" size={20} />
          <div className="nr-location-permission-copy">
            <strong>
              {language === "am" ? "አካባቢ ፈቃድ ጠፍቷል" : "Location is off"}
            </strong>
            <span>
              {language === "am"
                ? "የአካባቢ ፈቃድን በመሣሪያዎ ቅንብር ውስጥ ያንቁ።"
                : "Enable location permission in your device settings, then try again."}
            </span>
          </div>
          <button type="button" onClick={locate}>
            {language === "am" ? "እንደገና" : "Retry"}
          </button>
        </div>
      )}

      {gpsStale && position && status === "ready" && (
        <div className="nr-gps-status" role="status" aria-live="polite">
          {language === "am" ? "GPS በመፈለግ ላይ" : "Searching for GPS"}
        </div>
      )}

      {mapStatus === "unavailable" && (
        <div className="nr-map-unavailable" role="alert">
          <Icon name="globe" size={26} />
          <p>{t("mapUnavailable")}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>
            {t("tryAgain")}
          </button>
        </div>
      )}

      {mapStatus === "loading" && (
        <div className="nr-map-loading" role="status" aria-live="polite">
          <Spinner />
          {t("mapLoading")}
        </div>
      )}

      {rideLabel && (
        <div className="nr-map-ride-label">
          {back && (
            <button
              className="nr-icon-button"
              aria-label={t("back")}
              onClick={back}
              disabled={locked}
            >
              <Icon name="back" />
            </button>
          )}
          <div>
            <small>
              {t(
                journey?.routeState.status === "unavailable"
                  ? "pinsOnly"
                  : "dropoff",
              )}
            </small>
            <strong>
              {journey?.destination
                ? endpointName(journey.destination, language, t)
                : t("destination")}
            </strong>
          </div>
        </div>
      )}

      <div className="nr-rider-map-top">
        {showProfile && (
          <button
            className="nr-map-profile"
            aria-label={t("profileNav")}
            onClick={onProfile}
          >
            {initials === "NR" ? <Icon name="user" size={21} /> : initials}
          </button>
        )}
        <span className="nr-map-preview-chip">{topLabel || t("preview")}</span>
      </div>

      {fasterNotice !== null && (
        <div className="nr-faster-route-notice" role="status" aria-live="polite">
          <Icon name="refresh" size={16} />
          <span>
            {language === "am"
              ? `ፈጣን መንገድ ተገኝቷል · ${formatDuration(fasterNotice)} ይቆጥቡ`
              : `Faster route available · save ${formatDuration(fasterNotice)}`}
          </span>
          <button
            onClick={() => {
              journey?.selectRoute(0);
              setFasterNotice(null);
            }}
          >
            {language === "am" ? "ቀይር" : "Switch"}
          </button>
        </div>
      )}

      {journey?.destination?.confirmed && (
        <aside
          className="nr-live-route-panel"
          data-state={journey.routeState.status}
          aria-label={language === "am" ? "የመንገድ መረጃ" : "Route information"}
        >
          <div className="nr-live-route-handle" aria-hidden="true" />
          {journey.routeState.status === "loading" ? (
            <div className="nr-live-route-state" role="status">
              <Spinner />
              <span>{language === "am" ? "መንገድ በመፈለግ ላይ…" : "Finding traffic-aware routes…"}</span>
            </div>
          ) : journey.routeState.status === "ready" && route ? (
            <>
              <div className="nr-live-route-head">
                <div>
                  <small>{language === "am" ? "ቀጥታ ትራፊክ" : "Live traffic"}</small>
                  <strong>{formatDuration(route.durationSeconds)}</strong>
                </div>
                <div className="nr-live-route-metrics">
                  <span>{formatDistance(route.distanceMeters)}</span>
                  <span>
                    {route.delaySeconds !== undefined
                      ? route.delaySeconds > 30
                        ? language === "am"
                          ? `+${formatDuration(route.delaySeconds)} መዘግየት`
                          : `+${formatDuration(route.delaySeconds)} delay`
                        : language === "am"
                          ? "መዘግየት የለም"
                          : "No traffic delay"
                      : language === "am"
                        ? "መደበኛ ጊዜ የለም"
                        : "Typical time unavailable"}
                  </span>
                </div>
              </div>

              {(journey.routeState.alternatives?.length || 0) > 1 && (
                <div
                  className="nr-route-alternative-tabs"
                  role="radiogroup"
                  aria-label={language === "am" ? "አማራጭ መንገዶች" : "Alternative routes"}
                >
                  {journey.routeState.alternatives!.slice(0, 3).map((option, index) => (
                    <button
                      key={index}
                      type="button"
                      role="radio"
                      aria-checked={(journey.routeState.selectedIndex || 0) === index}
                      onClick={() => {
                        journey.selectRoute(index);
                        manualView.current = false;
                        window.setTimeout(() => {
                          if (mapRef.current)
                            fitJourney(mapRef.current, journeyRef.current, rideLabelRef.current);
                        }, 0);
                      }}
                    >
                      <span>{index === 0 ? (language === "am" ? "ፈጣን" : "Fastest") : `${language === "am" ? "መንገድ" : "Route"} ${index + 1}`}</span>
                      <strong>{formatDuration(option.durationSeconds)}</strong>
                    </button>
                  ))}
                </div>
              )}

              <div className="nr-live-route-actions">
                <button
                  type="button"
                  className="nr-route-reroute"
                  onClick={() => journey.retryRoute()}
                >
                  <Icon name="refresh" size={17} />
                  {language === "am" ? "እንደገና አቅጣጫ" : "Re-route"}
                </button>
                {onStartRoute && !readOnly && (
                  <button
                    type="button"
                    className="nr-route-start"
                    onClick={onStartRoute}
                  >
                    {language === "am" ? "ጉዞ ይምረጡ" : "Choose ride"}
                    <Icon name="arrow" size={17} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="nr-live-route-state error" role="alert">
              <Icon name="info" size={18} />
              <span>
                {journey.routeState.status === "same"
                  ? language === "am"
                    ? "መነሻና መድረሻ በጣም ቅርብ ናቸው።"
                    : "Origin and destination are too close."
                  : journey.routeState.status === "coverage"
                    ? language === "am"
                      ? "ይህ መንገድ ከአገልግሎት ክልሉ ውጭ ነው።"
                      : "This route is outside the current service area."
                    : language === "am"
                      ? "የትራፊክ መንገድ አልተገኘም።"
                      : "No traffic-aware route is available."}
              </span>
              <button onClick={() => journey.retryRoute()}>
                {language === "am" ? "እንደገና ሞክር" : "Try again"}
              </button>
            </div>
          )}
        </aside>
      )}

      {journey?.pinMode && (
        <button
          className="nr-use-map-center"
          disabled={mapStatus !== "ready"}
          onClick={() => {
            const map = mapRef.current;
            if (!map || !journey.pinMode) return;
            const center = map.getCenter();
            journey.setPin(journey.pinMode, {
              lat: center.lat,
              lng: center.lng,
            });
          }}
        >
          <Icon name="pin" size={18} />
          {t("useMapCenter")}
        </button>
      )}
    </section>
  );
}

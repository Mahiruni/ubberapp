"use client";

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  GeoJSONSource,
  Map as MapboxMap,
  Marker as MapboxMarker,
  Popup as MapboxPopup,
} from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";
import { Icon, LanguageContext, Spinner, useTranslation } from "./ui";
import { endpointName } from "./destination";
import type { Journey } from "../../lib/nexride-journey";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
import { formatDistance, formatDuration } from "../../lib/location";
import { places } from "../../lib/nexride-places";
import "mapbox-gl/dist/mapbox-gl.css";
import "@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css";

type MapStyleKey = "streets" | "satellite" | "dark";
type FeatureDetail = {
  id: string;
  title: string;
  details: string;
  category: string;
  lat: number;
  lng: number;
};

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

const placesGeoJson = {
  type: "FeatureCollection" as const,
  features: places.map((place, index) => ({
    type: "Feature" as const,
    id: index,
    properties: {
      id: `nexride-place-${index}`,
      title: place.name,
      details: place.address,
      category: place.category || "place",
      subcity: place.subcity || "",
    },
    geometry: {
      type: "Point" as const,
      coordinates: [place.lng, place.lat] as [number, number],
    },
  })),
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );

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

const heartbeatElement = () => {
  const root = document.createElement("div");
  root.className = "nr-live-location-marker";
  root.innerHTML =
    '<span class="nr-live-location-heart" aria-hidden="true"><i class="nr-live-location-core"></i></span>';
  return root;
};

const searchAreaElement = () => {
  const root = document.createElement("div");
  root.className = "nr-pickup-search-area";
  root.innerHTML =
    '<span class="nr-search-area-fill"></span><span class="nr-search-area-pulse"></span>';
  return root;
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
}) {
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const liveMarker = useRef<MapboxMarker | null>(null);
  const pickupMarker = useRef<MapboxMarker | null>(null);
  const destinationMarker = useRef<MapboxMarker | null>(null);
  const searchMarker = useRef<MapboxMarker | null>(null);
  const popupRef = useRef<MapboxPopup | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const planRef = useRef(journey);
  planRef.current = journey;
  const manualView = useRef(false);
  const mapGestureBlocked = useRef(false);
  const suppressMapClickUntil = useRef(0);
  const loadedRef = useRef(false);
  const lastRecenter = useRef(recenter);
  const hoveredFeature = useRef<string | number | null>(null);
  const activeStyleRef = useRef<MapStyleKey>("streets");

  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("streets");
  const [selectedFeature, setSelectedFeature] =
    useState<FeatureDetail | null>(null);

  const route =
    journey?.routeState.status === "ready"
      ? journey.routeState.route
      : undefined;
  const geometry = route?.geometry;
  const pickup = journey?.pickup;
  const destination = journey?.destination;

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

  const placesBounds = useMemo(() => {
    if (!placesGeoJson.features.length) return null;
    let west = Infinity,
      south = Infinity,
      east = -Infinity,
      north = -Infinity;
    for (const feature of placesGeoJson.features) {
      const [lng, lat] = feature.geometry.coordinates;
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    return [west, south, east, north] as [number, number, number, number];
  }, []);

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
        style: STYLE_URLS[styleKey],
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

      const nav = new mapboxgl.default.NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      });
      const geolocate = new mapboxgl.default.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showUserLocation: false,
        showAccuracyCircle: false,
      });
      const scale = new mapboxgl.default.ScaleControl({
        maxWidth: 100,
        unit: "metric",
      });
      const fullscreen = new mapboxgl.default.FullscreenControl({
        container: container.current.closest<HTMLElement>(
          ".nr-rider-map-surface",
        ) || undefined,
      });

      map.addControl(nav, "top-right");
      map.addControl(geolocate, "top-right");
      map.addControl(fullscreen, "top-right");
      map.addControl(scale, "bottom-left");

      const geocoder = new MapboxGeocoder({
        accessToken: token,
        mapboxgl: mapboxgl.default,
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

      geolocate.on("geolocate", () => locate());

      const installPlaces = () => {
        if (!map.isStyleLoaded()) return;
        if (!map.getSource("nexride-places")) {
          map.addSource("nexride-places", {
            type: "geojson",
            data: placesGeoJson,
            generateId: true,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 48,
          });
        }
        if (!map.getLayer("nexride-place-clusters")) {
          map.addLayer({
            id: "nexride-place-clusters",
            type: "circle",
            source: "nexride-places",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "#00c878",
              "circle-radius": [
                "step",
                ["get", "point_count"],
                18,
                15,
                23,
                40,
                29,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
              "circle-opacity": 0.92,
            },
          });
        }
        if (!map.getLayer("nexride-place-cluster-count")) {
          map.addLayer({
            id: "nexride-place-cluster-count",
            type: "symbol",
            source: "nexride-places",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 12,
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#041c30" },
          });
        }
        if (!map.getLayer("nexride-place-points")) {
          map.addLayer({
            id: "nexride-place-points",
            type: "circle",
            source: "nexride-places",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-radius": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                9,
                6,
              ],
              "circle-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#041c30",
                "#00c878",
              ],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            },
          });
        }
      };

      const installAccuracy = () => {
        if (!map.isStyleLoaded() || !position || status !== "ready") return;
        const data = accuracyPolygon(
          position.lat,
          position.lng,
          position.accuracy,
        );
        const source = map.getSource(
          "nexride-live-accuracy",
        ) as GeoJSONSource | undefined;
        if (source) source.setData(data);
        else {
          map.addSource("nexride-live-accuracy", {
            type: "geojson",
            data,
          });
          map.addLayer({
            id: "nexride-live-accuracy-fill",
            type: "fill",
            source: "nexride-live-accuracy",
            paint: {
              "fill-color": "#e5484d",
              "fill-opacity": 0.055,
            },
          });
          map.addLayer({
            id: "nexride-live-accuracy-outline",
            type: "line",
            source: "nexride-live-accuracy",
            paint: {
              "line-color": "#e5484d",
              "line-opacity": 0.2,
              "line-width": 1,
            },
          });
        }
      };

      const installRoute = () => {
        if (!map.isStyleLoaded()) return;
        const plan = planRef.current;
        const routeGeometry =
          plan?.routeState.status === "ready"
            ? plan.routeState.route?.geometry
            : undefined;
        const source = map.getSource(
          "nexride-route",
        ) as GeoJSONSource | undefined;
        const data = {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: (routeGeometry || []).map(
              ([lat, lng]) => [lng, lat] as [number, number],
            ),
          },
        };
        if (source) source.setData(data);
        else if (routeGeometry?.length) {
          map.addSource("nexride-route", { type: "geojson", data });
        }
        if (routeGeometry?.length && !map.getLayer("nexride-route-casing")) {
          map.addLayer({
            id: "nexride-route-casing",
            type: "line",
            source: "nexride-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#ffffff",
              "line-width": 9,
              "line-opacity": 0.94,
            },
          });
        }
        if (routeGeometry?.length && !map.getLayer("nexride-route-line")) {
          map.addLayer({
            id: "nexride-route-line",
            type: "line",
            source: "nexride-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#246bc6",
              "line-width": 5,
              "line-opacity": 0.96,
            },
          });
        }
      };

      const installStyleData = () => {
        hoveredFeature.current = null;
        installPlaces();
        installAccuracy();
        installRoute();
      };

      map.on("style.load", () => {
        if (cancelled) return;
        installStyleData();
        setMapStatus("ready");
      });

      map.on("load", () => {
        if (cancelled) return;
        loadedRef.current = true;
        setMounted(true);
        setMapStatus("ready");
        installStyleData();

        if (placesBounds) {
          map.fitBounds(
            [
              [placesBounds[0], placesBounds[1]],
              [placesBounds[2], placesBounds[3]],
            ],
            {
              padding: { top: 92, right: 44, bottom: 46, left: 44 },
              maxZoom: 13,
              duration: 0,
            },
          );
        }

        const input = container.current
          ?.closest(".nr-rider-map-surface")
          ?.querySelector<HTMLInputElement>(".mapboxgl-ctrl-geocoder--input");
        input?.setAttribute(
          "aria-label",
          language === "am" ? "ቦታ ይፈልጉ" : "Search places",
        );
      });

      map.on("error", () => {
        if (!loadedRef.current && !cancelled) setMapStatus("unavailable");
      });

      map.on("dragstart", () => {
        manualView.current = true;
      });
      map.on("zoomstart", () => {
        manualView.current = true;
      });

      map.on("click", "nexride-place-clusters", (event) => {
        const feature = event.features?.[0];
        const clusterId = Number(feature?.properties?.point_count
          ? feature.properties.cluster_id
          : feature?.properties?.cluster_id);
        const coordinates =
          feature?.geometry.type === "Point"
            ? feature.geometry.coordinates
            : undefined;
        if (!coordinates || !Number.isFinite(clusterId)) return;
        const source = map.getSource("nexride-places") as GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (error, zoom) => {
          if (error || zoom === null || zoom === undefined) return;
          map.easeTo({
            center: coordinates as [number, number],
            zoom,
            duration: 350,
          });
        });
      });

      map.on("click", "nexride-place-points", (event) => {
        const feature = event.features?.[0];
        if (!feature || feature.geometry.type !== "Point") return;
        const coordinates = feature.geometry.coordinates as [number, number];
        const properties = feature.properties || {};
        const detail: FeatureDetail = {
          id: String(properties.id || feature.id || ""),
          title: String(properties.title || "Place"),
          details: String(properties.details || ""),
          category: String(properties.category || "place"),
          lng: coordinates[0],
          lat: coordinates[1],
        };
        setSelectedFeature(detail);
        popupRef.current?.remove();
        const popup = new mapboxgl.default.Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 14,
          maxWidth: "280px",
        })
          .setLngLat(coordinates)
          .setHTML(
            `<div class="nr-map-popup"><strong>${escapeHtml(
              detail.title,
            )}</strong><p>${escapeHtml(
              detail.details,
            )}</p><a href="#nr-map-feature-details">View details</a></div>`,
          )
          .addTo(map);
        popupRef.current = popup;
      });

      const pointerOn = () => {
        map.getCanvas().style.cursor = "pointer";
      };
      const pointerOff = () => {
        map.getCanvas().style.cursor = "";
      };
      map.on("mouseenter", "nexride-place-clusters", pointerOn);
      map.on("mouseleave", "nexride-place-clusters", pointerOff);
      map.on("mouseenter", "nexride-place-points", (event) => {
        pointerOn();
        const feature = event.features?.[0];
        if (feature?.id === undefined || feature.id === null) return;
        hoveredFeature.current = feature.id;
        map.setFeatureState(
          { source: "nexride-places", id: feature.id },
          { hover: true },
        );
      });
      map.on("mouseleave", "nexride-place-points", () => {
        pointerOff();
        if (hoveredFeature.current === null) return;
        try {
          map.setFeatureState(
            { source: "nexride-places", id: hoveredFeature.current },
            { hover: false },
          );
        } catch {}
        hoveredFeature.current = null;
      });

      map.on("click", (event) => {
        if (
          mapGestureBlocked.current ||
          performance.now() < suppressMapClickUntil.current
        )
          return;
        const plan = planRef.current;
        if (plan?.pinMode)
          plan.setPin(plan.pinMode, {
            lat: event.lngLat.lat,
            lng: event.lngLat.lng,
          });
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
      popupRef.current?.remove();
      popupRef.current = null;
      pickupMarker.current?.remove();
      destinationMarker.current?.remove();
      liveMarker.current?.remove();
      searchMarker.current?.remove();
      pickupMarker.current = null;
      destinationMarker.current = null;
      liveMarker.current = null;
      searchMarker.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMounted(false);
      loadedRef.current = false;
    };
  }, [attempt, language]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mounted || !map) return;
    if (activeStyleRef.current === styleKey) return;
    activeStyleRef.current = styleKey;
    setMapStatus("loading");
    map.setStyle(STYLE_URLS[styleKey]);
  }, [styleKey, mounted]);

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
    const map = mapRef.current;
    if (!mounted || !map || !map.isStyleLoaded()) return;
    const source = map.getSource("nexride-live-accuracy") as
      | GeoJSONSource
      | undefined;

    if (!position || status !== "ready") {
      liveMarker.current?.remove();
      liveMarker.current = null;
      return;
    }

    const accuracy = accuracyPolygon(
      position.lat,
      position.lng,
      position.accuracy,
    );
    if (source) source.setData(accuracy);
    else {
      map.addSource("nexride-live-accuracy", {
        type: "geojson",
        data: accuracy,
      });
      map.addLayer({
        id: "nexride-live-accuracy-fill",
        type: "fill",
        source: "nexride-live-accuracy",
        paint: { "fill-color": "#e5484d", "fill-opacity": 0.055 },
      });
      map.addLayer({
        id: "nexride-live-accuracy-outline",
        type: "line",
        source: "nexride-live-accuracy",
        paint: {
          "line-color": "#e5484d",
          "line-opacity": 0.2,
          "line-width": 1,
        },
      });
    }

    const mapboxglPromise = import("mapbox-gl");
    void mapboxglPromise.then((mapboxgl) => {
      if (!mapRef.current) return;
      const isNew = !liveMarker.current;
      if (!liveMarker.current)
        liveMarker.current = new mapboxgl.default.Marker({
          element: heartbeatElement(),
          anchor: "center",
        }).setLngLat([position.lng, position.lat]).addTo(map);
      else liveMarker.current.setLngLat([position.lng, position.lat]);

      const recenterChanged = lastRecenter.current !== recenter;
      lastRecenter.current = recenter;
      if (isNew || recenterChanged) {
        manualView.current = false;
        map.easeTo({
          center: [position.lng, position.lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 350,
        });
      }
    });
  }, [position, status, recenter, mounted]);

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
          marker.on("dragstart", () => planRef.current?.invalidatePickup());
          marker.on("dragend", () => {
            const point = marker.getLngLat();
            planRef.current?.setPin("pickup", {
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

    const data = {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: (geometry || []).map(
          ([lat, lng]) => [lng, lat] as [number, number],
        ),
      },
    };
    const source = map.getSource("nexride-route") as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else if (geometry?.length) {
      map.addSource("nexride-route", { type: "geojson", data });
      map.addLayer({
        id: "nexride-route-casing",
        type: "line",
        source: "nexride-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffffff",
          "line-width": 9,
          "line-opacity": 0.94,
        },
      });
      map.addLayer({
        id: "nexride-route-line",
        type: "line",
        source: "nexride-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#246bc6",
          "line-width": 5,
          "line-opacity": 0.96,
        },
      });
    }

    if (!manualView.current && pickup?.confirmed && destination?.confirmed) {
      const mapboxglPromise = import("mapbox-gl");
      void mapboxglPromise.then((mapboxgl) => {
        if (!mapRef.current) return;
        const bounds = new mapboxgl.default.LngLatBounds();
        if (geometry?.length)
          geometry.forEach(([lat, lng]) => bounds.extend([lng, lat]));
        else {
          bounds.extend([pickup.lng, pickup.lat]);
          bounds.extend([destination.lng, destination.lat]);
        }
        map.fitBounds(bounds, {
          padding: {
            top: rideLabel ? 90 : 72,
            right: 34,
            bottom: 40,
            left: 34,
          },
          maxZoom: 16,
          duration: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? 0
            : 350,
        });
      });
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
      className="nr-rider-map-surface nr-mapbox-surface"
      inert={locked}
      aria-label={t("streetMap")}
      data-map-status={mapStatus}
    >
      <div
        ref={container}
        className="nr-geographic-map nr-mapbox-map"
        role="region"
        aria-label={t("streetMap")}
      />

      <div
        className="nr-map-style-switcher"
        role="group"
        aria-label={language === "am" ? "የካርታ ቅጥ" : "Map style"}
      >
        {(["streets", "satellite", "dark"] as MapStyleKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={styleKey === key}
            aria-label={
              language === "am"
                ? key === "streets"
                  ? "የመንገድ ካርታ"
                  : key === "satellite"
                    ? "የሳተላይት ካርታ"
                    : "ጨለማ ካርታ"
                : `${key[0].toUpperCase() + key.slice(1)} map`
            }
            onClick={() => setStyleKey(key)}
          >
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
          </button>
        ))}
      </div>

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
      {mapStatus === "ready" && placesGeoJson.features.length === 0 && (
        <div className="nr-map-empty" role="status">
          <Icon name="pin" size={22} />
          <span>
            {language === "am"
              ? "ምንም የካርታ ቦታዎች አልተገኙም።"
              : "No map places are available."}
          </span>
        </div>
      )}

      {selectedFeature && (
        <aside
          id="nr-map-feature-details"
          className="nr-map-feature-sheet"
          aria-label={
            language === "am" ? "የቦታ ዝርዝር" : "Place details"
          }
        >
          <div className="nr-map-feature-handle" aria-hidden="true" />
          <button
            className="nr-map-feature-close"
            onClick={() => {
              setSelectedFeature(null);
              popupRef.current?.remove();
            }}
            aria-label={t("close")}
          >
            ×
          </button>
          <small>{selectedFeature.category}</small>
          <strong>{selectedFeature.title}</strong>
          <p>{selectedFeature.details}</p>
          {journey && !readOnly && (
            <button
              className="nr-map-feature-action"
              onClick={() => {
                journey.select("destination", {
                  lat: selectedFeature.lat,
                  lng: selectedFeature.lng,
                  name: selectedFeature.title,
                  address: selectedFeature.details,
                  source: "preview",
                  confirmed: true,
                });
                setSelectedFeature(null);
                popupRef.current?.remove();
              }}
            >
              {language === "am" ? "መድረሻ አድርግ" : "Use as destination"}
            </button>
          )}
        </aside>
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
        <button
          className="nr-map-profile"
          aria-label={t("profileNav")}
          onClick={onProfile}
        >
          {initials === "NR" ? <Icon name="user" size={21} /> : initials}
        </button>
        <span className="nr-map-preview-chip">{topLabel || t("preview")}</span>
        <button
          className="nr-recenter"
          aria-label={t("recenter")}
          onClick={() => {
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
          <Icon name="locate" size={21} />
        </button>
      </div>

      {route && (
        <div
          className="nr-map-route-summary"
          data-traffic={route.traffic?.level || "unavailable"}
          role="status"
          aria-label={`${formatDuration(route.durationSeconds)}, ${formatDistance(
            route.distanceMeters,
          )}${trafficLabel ? `, ${trafficLabel}` : ""}`}
        >
          <span>
            <Icon name="clock" size={16} />
            <strong>{formatDuration(route.durationSeconds)}</strong>
          </span>
          <span>{formatDistance(route.distanceMeters)}</span>
          {trafficLabel && (
            <span className="nr-map-traffic">
              <i aria-hidden="true" />
              {trafficLabel}
            </span>
          )}
        </div>
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

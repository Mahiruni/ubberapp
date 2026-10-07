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
import { formatDistance, formatDuration } from "../../lib/location";
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

function routeData(journey: Journey | undefined) {
  const geometry =
    journey?.routeState.status === "ready"
      ? journey.routeState.route?.geometry
      : undefined;
  if (!geometry?.length) return emptyFeatureCollection;
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: geometry.map(
        ([lat, lng]) => [lng, lat] as [number, number],
      ),
    },
  };
}

function syncRoute(map: MapboxMap, journey: Journey | undefined) {
  if (!map.isStyleLoaded()) return;
  const data = routeData(journey);
  const hasRoute = data.type === "Feature";
  const source = map.getSource("nexride-route") as GeoJSONSource | undefined;

  if (source) {
    source.setData(data);
  } else if (hasRoute) {
    map.addSource("nexride-route", { type: "geojson", data });
  }

  if (hasRoute && !map.getLayer("nexride-route-casing")) {
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

  if (hasRoute && !map.getLayer("nexride-route-line")) {
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

function fitJourney(
  map: MapboxMap,
  journey: Journey | undefined,
  rideLabel: boolean,
) {
  const pickup = journey?.pickup;
  const destination = journey?.destination;
  if (!pickup?.confirmed || !destination?.confirmed) return;

  const geometry =
    journey.routeState.status === "ready"
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

  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: {
        top: rideLabel ? 88 : 68,
        right: 72,
        bottom: 54,
        left: 28,
      },
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
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const journeyRef = useRef(journey);
  const positionRef = useRef(position);
  const statusRef = useRef(status);
  const rideLabelRef = useRef(rideLabel);
  journeyRef.current = journey;
  positionRef.current = position;
  statusRef.current = status;
  rideLabelRef.current = rideLabel;

  const manualView = useRef(false);
  const mapGestureBlocked = useRef(false);
  const suppressMapClickUntil = useRef(0);
  const loadedRef = useRef(false);
  const lastRecenter = useRef(recenter);
  const activeStyleRef = useRef<MapStyleKey>("streets");

  const [mapStatus, setMapStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [styleKey, setStyleKey] = useState<MapStyleKey>("streets");
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [bearing, setBearing] = useState(0);

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

      const navigation = new mapboxgl.default.NavigationControl({
        showCompass: false,
        showZoom: true,
      });
      const fullscreen = new mapboxgl.default.FullscreenControl({
        container:
          container.current.closest<HTMLElement>(".nr-rider-map-surface") ||
          undefined,
      });
      const scale = new mapboxgl.default.ScaleControl({
        maxWidth: 92,
        unit: "metric",
      });

      map.addControl(navigation, "top-right");
      map.addControl(fullscreen, "top-right");
      map.addControl(scale, "bottom-left");

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

      const syncStyleData = () => {
        if (!map.isStyleLoaded()) return;
        syncRoute(map, journeyRef.current);
        syncAccuracy(map, positionRef.current, statusRef.current);
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

      const markManual = () => {
        manualView.current = true;
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
        const plan = journeyRef.current;
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
    setLayerMenuOpen(false);
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
    syncAccuracy(map, position, status);

    if (!position || status !== "ready") {
      liveMarker.current?.remove();
      liveMarker.current = null;
      return;
    }

    void import("mapbox-gl").then((mapboxgl) => {
      if (!mapRef.current) return;
      const isNew = !liveMarker.current;
      if (!liveMarker.current)
        liveMarker.current = new mapboxgl.default.Marker({
          element: heartbeatElement(),
          anchor: "center",
        })
          .setLngLat([position.lng, position.lat])
          .addTo(map);
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
            : 300,
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
    syncRoute(map, journey);

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
        <button
          className="nr-map-profile"
          aria-label={t("profileNav")}
          onClick={onProfile}
        >
          {initials === "NR" ? <Icon name="user" size={21} /> : initials}
        </button>
        <span className="nr-map-preview-chip">{topLabel || t("preview")}</span>
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

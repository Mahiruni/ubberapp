"use client";
import { useContext, useEffect, useRef, useState } from "react";
import type { Journey } from "../../lib/nexride-journey";
import type * as Leaflet from "leaflet";
import { Icon, LanguageContext, Spinner, useTranslation } from "./ui";
import { endpointName } from "./destination";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
import { formatDistance, formatDuration } from "../../lib/location";
import "leaflet/dist/leaflet.css";
function fitPlan(
  view: Leaflet.Map,
  bounds: Leaflet.LatLngBoundsExpression,
  ride: boolean,
) {
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  view.fitBounds(bounds, {
    paddingTopLeft: [28, ride ? 78 : 70],
    paddingBottomRight: [28, 28],
    maxZoom: 16,
    animate: !reduced,
    duration: reduced ? 0 : 0.35,
  });
}
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
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const marker = useRef<Leaflet.LayerGroup | null>(null);
  const planRef = useRef(journey);
  planRef.current = journey;
  const rideLabelRef = useRef(rideLabel);
  rideLabelRef.current = rideLabel;
  const planMarkers = useRef<Leaflet.LayerGroup | null>(null);
  const routeLine = useRef<Leaflet.Polyline | null>(null);
  const routeCasing = useRef<Leaflet.Polyline | null>(null);
  const manualView = useRef(false);
  const mapGestureBlocked = useRef(false);
  const suppressMapClickUntil = useRef(0);
  const [tiles, setTiles] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resize: ResizeObserver | undefined;
    const keys = new AbortController();
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
        view.on("click", (event: Leaflet.LeafletMouseEvent) => {
          if (
            mapGestureBlocked.current ||
            performance.now() < suppressMapClickUntil.current
          )
            return;
          const plan = planRef.current;
          if (plan?.pinMode)
            plan.setPin(plan.pinMode, {
              lat: event.latlng.lat,
              lng: event.latlng.lng,
            });
        });
        const markManualView = () => {
          manualView.current = true;
        };
        container.current.addEventListener("pointerdown", markManualView, {
          signal: keys.signal,
        });
        container.current.addEventListener("wheel", markManualView, {
          signal: keys.signal,
          passive: true,
        });
        container.current.addEventListener(
          "keydown",
          (event) => {
            const plan = planRef.current;
            if (event.key === "Enter" && plan?.pinMode) {
              const center = view.getCenter();
              plan.setPin(plan.pinMode, { lat: center.lat, lng: center.lng });
            }
          },
          { signal: keys.signal },
        );
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
        resize = new ResizeObserver(() => {
          view.invalidateSize();
          const plan = planRef.current;
          if (
            !manualView.current &&
            !plan?.pinMode &&
            plan?.pickup?.confirmed &&
            plan.destination?.confirmed
          ) {
            const bounds =
              plan.routeState.status === "ready" &&
              plan.routeState.route?.geometry
                ? plan.routeState.route.geometry
                : ([
                    [plan.pickup.lat, plan.pickup.lng],
                    [plan.destination.lat, plan.destination.lng],
                  ] as [number, number][]);
            fitPlan(view, bounds, rideLabelRef.current);
          }
        });
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
      keys.abort();
      map.current?.remove();
      map.current = null;
      marker.current = null;
      setMounted(false);
    };
  }, [attempt]);
  useEffect(() => {
    if (!mounted || !map.current || !container.current) return;
    const view = map.current;
    const stage = container.current.closest<HTMLElement>(".nr-stage");
    if (!stage) return;

    let activePointers = 0;

    const setMapEnabled = (enabled: boolean) => {
      const action = enabled ? "enable" : "disable";
      view.dragging?.[action]();
      view.touchZoom?.[action]();
      view.doubleClickZoom?.[action]();
      view.scrollWheelZoom?.[action]();
      view.boxZoom?.[action]();
      view.keyboard?.[action]();
      mapGestureBlocked.current = !enabled;
    };

    const pointInsidePanel = (clientX: number, clientY: number) => {
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

    const onPointerDown = (event: PointerEvent) => {
      if (!pointInsidePanel(event.clientX, event.clientY)) return;
      activePointers += 1;
      suppressMapClickUntil.current = performance.now() + 800;
      setMapEnabled(false);
    };

    const finishPointer = () => {
      if (!mapGestureBlocked.current) return;
      activePointers = Math.max(0, activePointers - 1);
      if (activePointers > 0) return;
      suppressMapClickUntil.current = performance.now() + 500;
      // Re-enable after the current browser gesture/click synthesis completes.
      window.setTimeout(() => {
        if (activePointers === 0) setMapEnabled(true);
      }, 0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (typeof PointerEvent !== "undefined") return;
      const touch = event.changedTouches[0];
      if (!touch || !pointInsidePanel(touch.clientX, touch.clientY)) return;
      activePointers += 1;
      suppressMapClickUntil.current = performance.now() + 800;
      setMapEnabled(false);
    };

    const onTouchEnd = () => {
      if (typeof PointerEvent !== "undefined") return;
      finishPointer();
    };

    // Capture phase runs before Leaflet's target listeners. We do not stop
    // propagation: sheet controls remain fully interactive.
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", finishPointer, true);
    document.addEventListener("pointercancel", finishPointer, true);
    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", onTouchEnd, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", finishPointer, true);
      document.removeEventListener("pointercancel", finishPointer, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
      setMapEnabled(true);
    };
  }, [mounted]);

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
    manualView.current = false;
    map.current.setView([position.lat, position.lng], 16, {
      animate: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, [position, status, recenter, mounted]);
  const pickup = journey?.pickup,
    destination = journey?.destination;
  const geometry =
    journey?.routeState.status === "ready"
      ? journey.routeState.route?.geometry
      : undefined;
  useEffect(() => {
    if (!mounted || !map.current || !library.current) return;
    planMarkers.current?.remove();
    planMarkers.current = null;
    if (!journey) return;
    const L = library.current;
    const group = L.layerGroup().addTo(map.current);
    planMarkers.current = group;
    if (pickup) {
      const pin = L.marker([pickup.lat, pickup.lng], {
        draggable: !readOnly,
        keyboard: true,
        autoPan: true,
        title: t("pickup"),
        alt: t("pickup"),
        icon: L.divIcon({
          className: "nr-pickup-marker",
          html: '<span class="nr-pin-core pickup"/>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
      pin.on("dragstart", () => planRef.current?.invalidatePickup());
      pin.on("dragend", () => {
        const point = pin.getLatLng();
        planRef.current?.setPin("pickup", { lat: point.lat, lng: point.lng });
      });
    }
    if (destination)
      L.marker([destination.lat, destination.lng], {
        keyboard: true,
        title: t("dropoff"),
        alt: t("dropoff"),
        icon: L.divIcon({
          className: "nr-destination-marker",
          html: '<span class="nr-pin-core destination"/>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(group);
    if (
      !planRef.current?.pinMode &&
      pickup?.confirmed &&
      destination?.confirmed
    ) {
      manualView.current = false;
      fitPlan(
        map.current,
        [
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ],
        rideLabelRef.current,
      );
    } else if (!planRef.current?.pinMode && (pickup || destination)) {
      const point = pickup || destination!;
      map.current.setView([point.lat, point.lng], 16, { animate: false });
    }
    return () => {
      group.remove();
    };
    // Confirmation and labels must not recreate a marker during a drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pickup?.lat,
    pickup?.lng,
    destination?.lat,
    destination?.lng,
    !!journey,
    mounted,
    readOnly,
  ]);
  useEffect(() => {
    routeLine.current?.remove();
    routeCasing.current?.remove();
    routeLine.current = null;
    routeCasing.current = null;
    if (!geometry || !mounted || !map.current || !library.current) return;
    const casing = library.current
      .polyline(geometry, {
        color: "#ffffff",
        weight: 9,
        opacity: 0.94,
        className: "nr-provider-route-casing",
        interactive: false,
      })
      .addTo(map.current);
    const line = library.current
      .polyline(geometry, {
        color: "#246bc6",
        weight: 5,
        opacity: 0.96,
        className: "nr-provider-route",
        interactive: false,
      })
      .addTo(map.current);
    routeCasing.current = casing;
    routeLine.current = line;
    manualView.current = false;
    fitPlan(map.current, line.getBounds(), rideLabelRef.current);
    return () => {
      line.remove();
      casing.remove();
    };
  }, [geometry, mounted]);
  useEffect(() => {
    if (!searching || !pickup || !mounted || !map.current || !library.current) return;
    // Screen-space indicator anchored to the confirmed pickup; no geographic coverage claim.
    const area = library.current.marker([pickup.lat, pickup.lng], {
      interactive: false, keyboard: false, zIndexOffset: -100,
      icon: library.current.divIcon({ className: 'nr-pickup-search-area', html: '<span class="nr-search-area-fill"/><span class="nr-search-area-pulse"/>', iconSize: [180, 180], iconAnchor: [90, 90] }),
    }).addTo(map.current);
    return () => { area.remove(); };
  }, [searching, pickup?.lat, pickup?.lng, mounted]);
  // Availability is not connected. No invented vehicle markers are rendered.
  const route =
    journey?.routeState.status === "ready"
      ? journey.routeState.route
      : undefined;
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
  return (
    <section
      className="nr-rider-map-surface"
      inert={locked}
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
          <Spinner />
          {t("mapLoading")}
        </div>
      )}
      {rideLabel && (
        <div className="nr-map-ride-label">
          {back && <button
            className="nr-icon-button"
            aria-label={t("back")}
            onClick={back}
            disabled={locked}
          >
            <Icon name="back" />
          </button>}
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
          onClick={locate}
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
          aria-label={`${formatDuration(route.durationSeconds)}, ${formatDistance(route.distanceMeters)}${trafficLabel ? `, ${trafficLabel}` : ""}`}
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
          disabled={tiles !== "ready"}
          onClick={() => {
            if (!map.current || !journey.pinMode) return;
            const center = map.current.getCenter();
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

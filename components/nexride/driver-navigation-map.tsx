"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Icon } from "./ui";
import "leaflet/dist/leaflet.css";

export type NavigationCoordinate = { lat: number; lng: number };
type MapView = "overview" | "vehicle";
type GpsState = "acquiring" | "fresh" | "stale" | "lost" | "unsupported";

const valid = (point: NavigationCoordinate | null | undefined): point is NavigationCoordinate =>
  Boolean(
    point &&
      Number.isFinite(point.lat) &&
      Math.abs(point.lat) <= 90 &&
      Number.isFinite(point.lng) &&
      Math.abs(point.lng) <= 180,
  );

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
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const routeLayer = useRef<Leaflet.Polyline | null>(null);
  const routeCasing = useRef<Leaflet.Polyline | null>(null);
  const markers = useRef<Leaflet.LayerGroup | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tilesReady, setTilesReady] = useState(true);

  useEffect(() => {
    let active = true;
    let resize: ResizeObserver | null = null;
    import("leaflet")
      .then((L) => {
        if (!active || !container.current || map.current) return;
        library.current = L;
        const initial = valid(vehicle)
          ? [vehicle.lat, vehicle.lng]
          : valid(pickup)
            ? [pickup.lat, pickup.lng]
            : valid(destination)
              ? [destination.lat, destination.lng]
              : [9.008, 38.775];
        const instance = L.map(container.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        }).setView(initial as Leaflet.LatLngExpression, valid(vehicle) || valid(pickup) || valid(destination) ? 14 : 12);

        const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "© OpenStreetMap",
        });
        tiles.on("tileerror", () => active && setTilesReady(false));
        tiles.on("load", () => active && setTilesReady(true));
        tiles.addTo(instance);

        markers.current = L.layerGroup().addTo(instance);
        map.current = instance;
        resize = new ResizeObserver(() => instance.invalidateSize());
        resize.observe(container.current);
        setMounted(true);
      })
      .catch(() => active && setTilesReady(false));

    return () => {
      active = false;
      resize?.disconnect();
      map.current?.remove();
      map.current = null;
      markers.current = null;
      routeLayer.current = null;
      routeCasing.current = null;
      library.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mounted || !map.current || !library.current || !markers.current) return;
    const L = library.current;
    const instance = map.current;
    markers.current.clearLayers();
    routeLayer.current?.remove();
    routeCasing.current?.remove();
    routeLayer.current = null;
    routeCasing.current = null;

    const known: Leaflet.LatLngExpression[] = [];
    const makeMarker = (
      point: NavigationCoordinate,
      kind: "vehicle" | "pickup" | "destination",
      activeTarget = false,
    ) => {
      const rotation = kind === "vehicle" && Number.isFinite(heading)
        ? Math.round(Number(heading))
        : 0;
      const icon = L.divIcon({
        className: "nr-live-nav-marker-wrap",
        html:
          '<span class="nr-live-nav-marker ' +
          kind +
          (activeTarget ? " target" : "") +
          '" style="--nr-heading:' +
          rotation +
          'deg" aria-hidden="true"></span>',
        iconSize: kind === "vehicle" ? [34, 34] : [28, 28],
        iconAnchor: kind === "vehicle" ? [17, 17] : [14, 28],
      });
      const label = kind === "vehicle" ? "Your vehicle" : kind === "pickup" ? "Pickup" : "Destination";
      L.marker([point.lat, point.lng], { icon, title: label, keyboard: false })
        .bindTooltip(label, { direction: "top", offset: [0, -12] })
        .addTo(markers.current!);
      known.push([point.lat, point.lng]);
    };

    if (valid(pickup)) makeMarker(pickup, "pickup", target === "pickup");
    if (valid(destination)) makeMarker(destination, "destination", target === "destination");
    if (valid(vehicle)) makeMarker(vehicle, "vehicle");

    const road = route.filter(valid);
    if (road.length >= 2) {
      const points = road.map((point) => [point.lat, point.lng] as [number, number]);
      routeCasing.current = L.polyline(points, {
        color: "#ffffff",
        weight: 10,
        opacity: 0.92,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(instance);
      routeLayer.current = L.polyline(points, {
        color: "#246bc6",
        weight: 6,
        opacity: 0.98,
        lineCap: "round",
        lineJoin: "round",
        interactive: false,
      }).addTo(instance);
      known.push(...points);
    }

    requestAnimationFrame(() => {
      instance.invalidateSize();
      if (view === "vehicle" && valid(vehicle)) {
        instance.setView([vehicle.lat, vehicle.lng], Math.max(instance.getZoom(), 16), { animate: true });
        return;
      }
      if (known.length >= 2) {
        instance.fitBounds(L.latLngBounds(known), {
          paddingTopLeft: [34, 74],
          paddingBottomRight: [34, 150],
          maxZoom: 16,
          animate: true,
        });
      } else if (known.length === 1) {
        instance.setView(known[0], 15, { animate: true });
      }
    });
  }, [destination, gpsState, heading, mounted, pickup, route, target, vehicle, view]);

  const recenter = () => {
    if (!map.current) return;
    if (valid(vehicle)) {
      map.current.setView([vehicle.lat, vehicle.lng], 16, { animate: true });
      return;
    }
    const targetPoint = target === "pickup" ? pickup : destination;
    if (valid(targetPoint)) map.current.setView([targetPoint.lat, targetPoint.lng], 15, { animate: true });
  };

  return (
    <div
      className="nr-navigation-map nr-live-navigation-map"
      role="region"
      aria-label="Live NexRide route map. Turn-by-turn directions can be opened in the external navigation app."
      data-gps={gpsState}
      data-target={target}
    >
      <div ref={container} className="nr-live-navigation-canvas" />
      {!tilesReady && (
        <div className="nr-live-map-status" role="status">
          Map tiles unavailable. Route details remain available below.
        </div>
      )}
      {route.filter(valid).length < 2 && (
        <div className="nr-live-map-status route" role="status">
          Road route is unavailable. NexRide will not draw an estimated straight-line route.
        </div>
      )}
      <button type="button" className="nr-live-map-recenter" onClick={recenter} aria-label="Recenter map">
        <Icon name="locate" size={20} />
      </button>
    </div>
  );
}

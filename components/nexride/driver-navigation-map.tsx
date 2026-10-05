"use client";

export type NavigationCoordinate = { lat: number; lng: number };
type MapView = "overview" | "vehicle";
type GpsState = "acquiring" | "fresh" | "stale" | "lost" | "unsupported";
type Point = { x: number; y: number };

const fallbackVehicle: Point = { x: 760, y: 630 };
const fallbackPickup: Point = { x: 585, y: 470 };
const fallbackDestination: Point = { x: 345, y: 270 };

function projectPoints(vehicle: NavigationCoordinate | null, pickup: NavigationCoordinate | null, destination: NavigationCoordinate | null) {
  const known = [vehicle, pickup, destination].filter(Boolean) as NavigationCoordinate[];
  if (known.length < 2) return {
    vehicle: vehicle ? fallbackVehicle : null,
    pickup: pickup ? fallbackPickup : null,
    destination: destination ? fallbackDestination : null,
  };

  const lats = known.map((p) => p.lat);
  const lngs = known.map((p) => p.lng);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 0.008);
  const lngSpan = Math.max(Math.max(...lngs) - Math.min(...lngs), 0.008);
  const minLat = Math.min(...lats) - latSpan * 0.25;
  const maxLat = Math.max(...lats) + latSpan * 0.25;
  const minLng = Math.min(...lngs) - lngSpan * 0.25;
  const maxLng = Math.max(...lngs) + lngSpan * 0.25;

  const project = (p: NavigationCoordinate | null): Point | null => p ? ({
    x: 120 + ((p.lng - minLng) / (maxLng - minLng)) * 860,
    y: 100 + ((maxLat - p.lat) / (maxLat - minLat)) * 700,
  }) : null;

  return { vehicle: project(vehicle), pickup: project(pickup), destination: project(destination) };
}

export function DriverNavigationMap({
  vehicle, pickup, destination, target, view, gpsState, heading,
}: {
  vehicle: NavigationCoordinate | null;
  pickup: NavigationCoordinate | null;
  destination: NavigationCoordinate | null;
  target: "pickup" | "destination";
  view: MapView;
  gpsState: GpsState;
  heading: number | null;
}) {
  const projected = projectPoints(vehicle, pickup, destination);
  const vehiclePoint = projected.vehicle || fallbackVehicle;
  const pickupPoint = projected.pickup || fallbackPickup;
  const destinationPoint = projected.destination || fallbackDestination;
  const targetPoint = target === "pickup" ? pickupPoint : destinationPoint;
  const routeStart = projected.vehicle || fallbackVehicle;
  const zoom = view === "vehicle" && projected.vehicle ? 1.34 : 1;
  const tx = view === "vehicle" && projected.vehicle ? 550 - zoom * vehiclePoint.x : 0;
  const ty = view === "vehicle" && projected.vehicle ? 450 - zoom * vehiclePoint.y : 0;
  const transform = `matrix(${zoom} 0 0 ${zoom} ${tx} ${ty})`;
  const markerClass = gpsState === "fresh" ? "fresh" : gpsState === "stale" ? "stale" : "lost";
  const routePath = `M ${routeStart.x} ${routeStart.y} Q ${(routeStart.x + targetPoint.x) / 2 + 52} ${(routeStart.y + targetPoint.y) / 2 - 56} ${targetPoint.x} ${targetPoint.y}`;

  return (
    <div className="nr-navigation-map" role="img" aria-label="NexRide route overview. Turn-by-turn directions are provided by the external navigation app.">
      <svg viewBox="0 0 1100 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id="nav-grid" width="145" height="125" patternUnits="userSpaceOnUse" patternTransform="rotate(-14)">
            <rect width="145" height="125" className="nr-nav-map-ground" />
            <rect x="12" y="12" width="52" height="42" rx="5" className="nr-nav-map-block" />
            <rect x="74" y="12" width="58" height="42" rx="5" className="nr-nav-map-block" />
            <rect x="12" y="66" width="120" height="44" rx="5" className="nr-nav-map-block" />
          </pattern>
        </defs>
        <g transform={transform}>
          <rect width="1100" height="900" fill="url(#nav-grid)" />
          <path d="M-90 640Q240 560 430 390T1190 170M70-80Q250 180 560 520T910 980M-70 755 1170 520" className="nr-nav-map-road-edge" />
          <path d="M-90 640Q240 560 430 390T1190 170M70-80Q250 180 560 520T910 980M-70 755 1170 520" className="nr-nav-map-road" />
          <path d="M390-60 340 220 565 405 970 470M-30 355 390 310 560 0M180 940 290 675 690 405 1160 390" className="nr-nav-map-minor" />
          <path d={routePath} className="nr-nav-route-casing" />
          <path d={routePath} className="nr-nav-route" />
          <circle cx={pickupPoint.x} cy={pickupPoint.y} r="12" className="nr-nav-pickup-marker" />
          <rect x={destinationPoint.x - 10} y={destinationPoint.y - 10} width="20" height="20" rx="5" className="nr-nav-destination-marker" />
          {projected.vehicle && (
            <g className={`nr-nav-vehicle ${markerClass}`} transform={`translate(${vehiclePoint.x} ${vehiclePoint.y}) rotate(${heading ?? 0})`}>
              <circle r="27" className="nr-nav-vehicle-halo" />
              <circle r="18" className="nr-nav-vehicle-core" />
              <path d="M0-11 8 9 0 5-8 9Z" className="nr-nav-vehicle-arrow" />
            </g>
          )}
        </g>
      </svg>
      <div className="nr-nav-map-disclaimer">ROUTE OVERVIEW · TURN-BY-TURN OPENS IN MAPS</div>
    </div>
  );
}

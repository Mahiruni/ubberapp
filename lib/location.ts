export type LatLng = { lat: number; lng: number };
export type RouteStep = {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuver: LatLng;
  type?: string;
  modifier?: string;
  roadName?: string;
};
export type TrafficLevel = "low" | "moderate" | "heavy" | "severe";
export type RouteTrafficSegment = {
  from: [number, number];
  to: [number, number];
  congestion?: TrafficLevel;
  durationSeconds?: number;
};
export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  durationTypicalSeconds?: number;
  delaySeconds?: number;
  geometry?: [number, number][];
  segments?: RouteTrafficSegment[];
  steps?: RouteStep[];
  provider: "mapbox" | "fallback";
  traffic?: {
    level: TrafficLevel;
    provider: "mapbox";
    segments: number;
  };
};

const MAPBOX = "https://api.mapbox.com";

export const mapboxToken = () => {
  const value = (
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
    ""
  ).trim();
  return !value || value.includes("replace_me") ? "" : value;
};

const token = mapboxToken;

export function haversineMeters(a: LatLng, b: LatLng) {
  const R = 6371008.8;
  const p1 = (a.lat * Math.PI) / 180,
    p2 = (b.lat * Math.PI) / 180,
    dp = ((b.lat - a.lat) * Math.PI) / 180,
    dl = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type DirectionsOptions = {
  profile?: "driving" | "driving-traffic";
  requireProvider?: boolean;
  signal?: AbortSignal;
  steps?: boolean;
  alternatives?: boolean;
};

const trafficSummary = (values: unknown[]) => {
  const congestion = values.filter((value): value is TrafficLevel =>
    ["low", "moderate", "heavy", "severe"].includes(String(value)),
  );
  if (!congestion.length) return undefined;
  const rank: TrafficLevel[] = ["low", "moderate", "heavy", "severe"];
  const counts = new Map<TrafficLevel, number>();
  for (const level of congestion)
    counts.set(level, (counts.get(level) || 0) + 1);
  const level = rank.reduce((best, current) => {
    const bestCount = counts.get(best) || 0;
    const currentCount = counts.get(current) || 0;
    return currentCount > bestCount ||
      (currentCount === bestCount &&
        rank.indexOf(current) > rank.indexOf(best))
      ? current
      : best;
  }, "low" as TrafficLevel);
  return {
    level,
    provider: "mapbox" as const,
    segments: congestion.length,
  };
};

const parseRoute = (
  route: Record<string, any>,
  includeSteps: boolean,
): RouteResult => {
  const coordinates = Array.isArray(route.geometry?.coordinates)
    ? (route.geometry.coordinates as unknown[])
    : [];
  if (
    !Number.isFinite(route.distance) ||
    route.distance < 0 ||
    !Number.isFinite(route.duration) ||
    route.duration < 0 ||
    coordinates.length < 2 ||
    !coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        Number.isFinite(Number(coordinate[0])) &&
        Math.abs(Number(coordinate[0])) <= 180 &&
        Number.isFinite(Number(coordinate[1])) &&
        Math.abs(Number(coordinate[1])) <= 90,
    )
  )
    throw new Error("route_invalid");

  const geometry = coordinates.map((coordinate) => [
    Number((coordinate as unknown[])[1]),
    Number((coordinate as unknown[])[0]),
  ]) as [number, number][];

  const congestionValues = (route.legs || []).flatMap(
    (leg: { annotation?: { congestion?: unknown[] } }) =>
      Array.isArray(leg.annotation?.congestion)
        ? leg.annotation!.congestion!
        : [],
  );
  const durationValues = (route.legs || []).flatMap(
    (leg: { annotation?: { duration?: unknown[] } }) =>
      Array.isArray(leg.annotation?.duration) ? leg.annotation!.duration! : [],
  );

  const segmentCount = Math.min(
    Math.max(0, geometry.length - 1),
    Math.max(congestionValues.length, durationValues.length),
  );
  const segments: RouteTrafficSegment[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const congestion = String(congestionValues[index] || "");
    const duration = Number(durationValues[index]);
    segments.push({
      from: geometry[index],
      to: geometry[index + 1],
      ...(["low", "moderate", "heavy", "severe"].includes(congestion)
        ? { congestion: congestion as TrafficLevel }
        : {}),
      ...(Number.isFinite(duration) && duration >= 0
        ? { durationSeconds: duration }
        : {}),
    });
  }

  const typical = Number(route.duration_typical);
  const durationTypicalSeconds =
    Number.isFinite(typical) && typical >= 0 ? typical : undefined;
  const delaySeconds =
    durationTypicalSeconds === undefined
      ? undefined
      : Math.max(0, Number(route.duration) - durationTypicalSeconds);

  return {
    distanceMeters: Number(route.distance),
    durationSeconds: Number(route.duration),
    ...(durationTypicalSeconds !== undefined
      ? { durationTypicalSeconds, delaySeconds }
      : {}),
    geometry,
    ...(segments.length ? { segments } : {}),
    traffic: trafficSummary(congestionValues),
    steps: includeSteps
      ? (route.legs || [])
          .flatMap((leg: { steps?: unknown[] }) =>
            Array.isArray(leg.steps) ? leg.steps : [],
          )
          .map(
            (step: {
              distance?: unknown;
              duration?: unknown;
              name?: unknown;
              maneuver?: {
                instruction?: unknown;
                location?: unknown;
                type?: unknown;
                modifier?: unknown;
              };
            }) => {
              const location = Array.isArray(step.maneuver?.location)
                ? (step.maneuver!.location as unknown[])
                : [];
              const lng = Number(location[0]);
              const lat = Number(location[1]);
              return {
                instruction:
                  typeof step.maneuver?.instruction === "string"
                    ? step.maneuver.instruction
                    : "Continue",
                distanceMeters: Number.isFinite(Number(step.distance))
                  ? Number(step.distance)
                  : 0,
                durationSeconds: Number.isFinite(Number(step.duration))
                  ? Number(step.duration)
                  : 0,
                maneuver: { lat, lng },
                type:
                  typeof step.maneuver?.type === "string"
                    ? step.maneuver.type
                    : undefined,
                modifier:
                  typeof step.maneuver?.modifier === "string"
                    ? step.maneuver.modifier
                    : undefined,
                roadName:
                  typeof step.name === "string" && step.name
                    ? step.name
                    : undefined,
              };
            },
          )
          .filter(
            (step: RouteStep) =>
              Number.isFinite(step.maneuver.lat) &&
              Number.isFinite(step.maneuver.lng),
          )
      : undefined,
    provider: "mapbox",
  };
};

export async function routeAlternatives(
  points: LatLng[],
  options: DirectionsOptions = {},
): Promise<RouteResult[]> {
  if (points.length < 2) throw new Error("route requires at least two points");
  const t = token();
  if (!t) {
    if (options.requireProvider) throw new Error("provider_unavailable");
    const distance = points
      .slice(1)
      .reduce((sum, point, index) => sum + haversineMeters(points[index], point), 0);
    return [
      {
        distanceMeters: distance,
        durationSeconds: Math.max(60, Math.round(distance / 7)),
        provider: "fallback",
      },
    ];
  }

  const coords = points.map((point) => point.lng + "," + point.lat).join(";");
  const profile = options.profile || "driving-traffic";
  const alternatives = options.alternatives !== false;

  const requestRoute = async (snapRadius: number) => {
    const annotations =
      profile === "driving-traffic"
        ? "&annotations=congestion,duration"
        : "&annotations=duration";
    const response = await fetch(
      MAPBOX +
        "/directions/v5/mapbox/" +
        profile +
        "/" +
        coords +
        "?alternatives=" +
        (alternatives ? "true" : "false") +
        "&geometries=geojson&overview=full&steps=" +
        (options.steps ? "true" : "false") +
        annotations +
        "&language=en&radiuses=" +
        points.map(() => snapRadius).join(";") +
        "&access_token=" +
        encodeURIComponent(t),
      {
        headers: { Accept: "application/json" },
        signal: options.signal || AbortSignal.timeout(8000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new Error("routing_unavailable:" + response.status);
    return response.json();
  };

  let payload = await requestRoute(100);
  if (!payload.routes?.length && payload.code === "NoSegment")
    payload = await requestRoute(500);

  const parsed = (Array.isArray(payload.routes) ? payload.routes : [])
    .slice(0, 3)
    .map((route: Record<string, any>) => parseRoute(route, !!options.steps))
    .sort((a: RouteResult, b: RouteResult) =>
      a.durationSeconds - b.durationSeconds ||
      a.distanceMeters - b.distanceMeters,
    );
  if (!parsed.length) throw new Error("route_not_found");
  return parsed;
}

export async function routeBetween(
  points: LatLng[],
  options: DirectionsOptions = {},
): Promise<RouteResult> {
  const routes = await routeAlternatives(points, {
    ...options,
    alternatives: false,
  });
  return routes[0];
}

export async function reverseGeocode(p: LatLng) {
  const t = token();
  if (!t) return null;
  const res = await fetch(
    MAPBOX +
      "/search/geocode/v6/reverse?longitude=" +
      p.lng +
      "&latitude=" +
      p.lat +
      "&limit=1&access_token=" +
      encodeURIComponent(t),
  );
  if (!res.ok) return null;
  const j = await res.json();
  return (
    j.features?.[0]?.properties?.full_address ||
    j.features?.[0]?.properties?.name ||
    null
  );
}

export function navigationUrl(
  p: LatLng,
  provider: "google" | "apple" | "waze" = "google",
) {
  const q = p.lat + "," + p.lng;
  if (provider === "waze")
    return (
      "https://www.waze.com/ul?ll=" + encodeURIComponent(q) + "&navigate=yes"
    );
  if (provider === "apple")
    return "http://maps.apple.com/?daddr=" + encodeURIComponent(q);
  return (
    "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(q) +
    "&travelmode=driving"
  );
}

export function formatDistance(m: number) {
  return m < 1000
    ? Math.round(m / 10) * 10 + " m"
    : (m / 1000).toFixed(1) + " km";
}

export function formatDuration(s: number) {
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? m + " min" : Math.floor(m / 60) + "h " + (m % 60) + "m";
}

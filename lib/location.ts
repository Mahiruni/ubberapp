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
export type RouteResult = {
  distanceMeters: number;
  durationSeconds: number;
  geometry?: [number, number][];
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
export async function routeBetween(
  points: LatLng[],
  options: {
    profile?: "driving" | "driving-traffic";
    requireProvider?: boolean;
    signal?: AbortSignal;
    steps?: boolean;
  } = {},
): Promise<RouteResult> {
  if (points.length < 2) throw new Error("route requires at least two points");
  const t = token();
  if (!t) {
    if (options.requireProvider) throw new Error("provider_unavailable");
    const d = points
      .slice(1)
      .reduce((sum, p, i) => sum + haversineMeters(points[i], p), 0);
    return {
      distanceMeters: d,
      durationSeconds: Math.max(60, Math.round(d / 7)),
      provider: "fallback",
    };
  }
  const coords = points.map((p) => p.lng + "," + p.lat).join(";");
  const profile = options.profile || "driving-traffic";
  const res = await fetch(
    MAPBOX +
      "/directions/v5/mapbox/" +
      profile +
      "/" +
      coords +
      "?alternatives=false&geometries=geojson&overview=full&steps=" +
      (options.steps ? "true" : "false") +
      (profile === "driving-traffic" ? "&annotations=congestion" : "") +
      "&language=en&radiuses=" +
      points.map(() => 100).join(";") +
      "&access_token=" +
      encodeURIComponent(t),
    {
      headers: { Accept: "application/json" },
      signal: options.signal || AbortSignal.timeout(8000),
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error("routing_unavailable:" + res.status);
  const j = await res.json();
  const r = j.routes?.[0];
  if (!r) throw new Error("route_not_found");
  if (
    !Number.isFinite(r.distance) ||
    r.distance < 0 ||
    !Number.isFinite(r.duration) ||
    r.duration < 0 ||
    r.geometry?.coordinates?.length < 2 ||
    !r.geometry?.coordinates?.every(
      (c: number[]) =>
        c.length >= 2 &&
        Number.isFinite(c[0]) &&
        Math.abs(c[0]) <= 180 &&
        Number.isFinite(c[1]) &&
        Math.abs(c[1]) <= 90,
    )
  )
    throw new Error("route_invalid");
  const congestion = (r.legs || [])
    .flatMap((leg: { annotation?: { congestion?: unknown[] } }) =>
      Array.isArray(leg.annotation?.congestion) ? leg.annotation!.congestion! : [],
    )
    .filter((value: unknown): value is TrafficLevel =>
      ["low", "moderate", "heavy", "severe"].includes(String(value)),
    );
  const traffic = congestion.length
    ? (() => {
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
        return { level, provider: "mapbox" as const, segments: congestion.length };
      })()
    : undefined;
  return {
    distanceMeters: r.distance,
    durationSeconds: r.duration,
    geometry: r.geometry?.coordinates?.map((c: [number, number]) => [
      c[1],
      c[0],
    ]),
    traffic,
    steps: options.steps
      ? (r.legs || [])
          .flatMap((leg: { steps?: unknown[] }) => Array.isArray(leg.steps) ? leg.steps : [])
          .map((step: {
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
            const location = Array.isArray(step.maneuver?.location) ? step.maneuver!.location as unknown[] : [];
            const lng = Number(location[0]);
            const lat = Number(location[1]);
            return {
              instruction: typeof step.maneuver?.instruction === "string" ? step.maneuver.instruction : "Continue",
              distanceMeters: Number.isFinite(Number(step.distance)) ? Number(step.distance) : 0,
              durationSeconds: Number.isFinite(Number(step.duration)) ? Number(step.duration) : 0,
              maneuver: { lat, lng },
              type: typeof step.maneuver?.type === "string" ? step.maneuver.type : undefined,
              modifier: typeof step.maneuver?.modifier === "string" ? step.maneuver.modifier : undefined,
              roadName: typeof step.name === "string" && step.name ? step.name : undefined,
            };
          })
          .filter((step: RouteStep) => Number.isFinite(step.maneuver.lat) && Number.isFinite(step.maneuver.lng))
      : undefined,
    provider: "mapbox",
  };
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

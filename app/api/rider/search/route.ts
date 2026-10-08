import { mapboxToken } from "../../../../lib/location";
import {
  ADDIS_CENTER,
  ADDIS_CORE_BOUNDS,
  ADDIS_SEARCH_BOUNDS,
  PREVIEW_BOUNDS,
  insideAddisServiceRadius,
  insideBounds,
  searchPreviewPlaces,
  validPoint,
} from "../../../../lib/nexride-search";

const SEARCH_CACHE_TTL = 2 * 60_000;
const searchCache = new Map<string, { at: number; results: Result[] }>();

const response = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-NexRide-Places": "live-mapbox",
    },
  });

type Result = {
  lat: number;
  lng: number;
  name: string;
  address: string;
  source: "provider" | "preview";
  confirmed: boolean;
  provider: "mapbox" | "nexride";
  providerPlaceId?: string;
  category?: string;
};

const normalizeFeature = (feature: {
  id?: unknown;
  geometry?: { coordinates?: unknown[] };
  properties?: {
    name?: unknown;
    full_address?: unknown;
    address?: unknown;
    place_formatted?: unknown;
    match_code?: { confidence?: unknown };
    feature_type?: unknown;
    mapbox_id?: unknown;
    poi_category?: unknown;
  };
}): Result | null => {
  const coords = feature.geometry?.coordinates;
  const point = { lat: Number(coords?.[1]), lng: Number(coords?.[0]) };
  const props = feature.properties;
  const name = typeof props?.name === "string" ? props.name.trim() : "";
  if (!validPoint(point) || !name) return null;

  const address =
    (typeof props?.full_address === "string" && props.full_address.trim()) ||
    (typeof props?.place_formatted === "string" &&
      props.place_formatted.trim()) ||
    (typeof props?.address === "string" && props.address.trim()) ||
    name;

  const category =
    Array.isArray(props?.poi_category) &&
    typeof props.poi_category[0] === "string"
      ? props.poi_category[0]
      : typeof props?.feature_type === "string"
        ? props.feature_type
        : undefined;

  return {
    ...point,
    name,
    address,
    source: "provider",
    confirmed: props?.match_code?.confidence !== "low",
    provider: "mapbox",
    providerPlaceId:
      typeof props?.mapbox_id === "string"
        ? props.mapbox_id
        : typeof feature.id === "string"
          ? feature.id
          : undefined,
    category,
  };
};

const dedupe = (results: Result[]) => {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = [
      item.name.toLocaleLowerCase(),
      item.lat.toFixed(5),
      item.lng.toFixed(5),
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const rank = (
  results: Result[],
  q: string,
  proximity: { lat: number; lng: number },
) => {
  const needle = q.normalize("NFKC").toLocaleLowerCase().trim();
  return results
    .map((place, index) => {
      const name = place.name.normalize("NFKC").toLocaleLowerCase();
      const address = place.address.normalize("NFKC").toLocaleLowerCase();
      const dy = place.lat - proximity.lat;
      const dx = place.lng - proximity.lng;
      const approximateDistance = Math.sqrt(dx * dx + dy * dy);
      let score = -index * 0.01;

      if (name === needle) score += 140;
      else if (name.startsWith(needle)) score += 90;
      else if (name.includes(needle)) score += 55;
      else if (address.includes(needle)) score += 24;

      if (insideBounds(place, ADDIS_CORE_BOUNDS)) score += 38;
      else if (insideBounds(place, PREVIEW_BOUNDS)) score += 20;
      score += Math.max(0, 24 - approximateDistance * 120);

      return { place, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.place);
};

async function geocode(
  token: string,
  q: string,
  language: "en" | "am",
  proximity: { lat: number; lng: number },
): Promise<Result[]> {
  const query = new URLSearchParams({
    access_token: token,
    q,
    country: "et",
    proximity: `${proximity.lng},${proximity.lat}`,
    bbox: ADDIS_SEARCH_BOUNDS.join(","),
    autocomplete: "true",
    limit: "10",
    language: language === "am" ? "am,en" : "en,am",
  });
  const result = await fetch(
    `https://api.mapbox.com/search/geocode/v6/forward?${query}`,
    { signal: AbortSignal.timeout(7000), cache: "no-store" },
  );
  if (!result.ok) throw new Error("geocoding_failed");
  const data = await result.json();
  return (Array.isArray(data.features) ? data.features : [])
    .map(normalizeFeature)
    .filter((item: Result | null): item is Result => !!item);
}

async function searchPlaces(
  token: string,
  q: string,
  language: "en" | "am",
  proximity: { lat: number; lng: number },
): Promise<Result[]> {
  const params = new URLSearchParams({
    q,
    access_token: token,
    country: "ET",
    proximity: `${proximity.lng},${proximity.lat}`,
    bbox: ADDIS_SEARCH_BOUNDS.join(","),
    limit: "10",
    language,
  });
  const result = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/forward?${params}`,
    { signal: AbortSignal.timeout(7000), cache: "no-store" },
  );
  if (!result.ok) return [];
  const payload = await result.json();
  return (Array.isArray(payload.features) ? payload.features : [])
    .map(normalizeFeature)
    .filter((item: Result | null): item is Result => !!item);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const reverse = params.get("mode") === "reverse";
  const q = params.get("q")?.trim() || "";
  const language = params.get("lang") === "am" ? "am" : "en";
  const point = {
    lat: Number(params.get("lat")),
    lng: Number(params.get("lng")),
  };

  if (
    reverse
      ? !params.has("lat") || !params.has("lng") || !validPoint(point)
      : !q || q.length > 120 || q.includes(";") || q.split(/\s+/).length > 20
  ) {
    return response({ status: "invalid", results: [] }, 400);
  }

  const token = mapboxToken();
  if (!token) return response({ status: "unavailable", results: [] }, 503);

  if (reverse) {
    const query = new URLSearchParams({
      access_token: token,
      longitude: String(point.lng),
      latitude: String(point.lat),
      limit: "1",
      language: language === "am" ? "am,en" : "en,am",
    });
    try {
      const result = await fetch(
        `https://api.mapbox.com/search/geocode/v6/reverse?${query}`,
        { signal: AbortSignal.timeout(8000), cache: "no-store" },
      );
      if (!result.ok) throw new Error("reverse_failed");
      const data = await result.json();
      const results = (Array.isArray(data.features) ? data.features : [])
        .map(normalizeFeature)
        .filter((item: Result | null): item is Result => !!item)
        .filter(insideAddisServiceRadius);
      return response({
        status: "ready",
        results,
        coverage: "addis-100km",
      });
    } catch {
      return response({ status: "error", results: [] }, 502);
    }
  }

  const proximity =
    params.has("lat") &&
    params.has("lng") &&
    validPoint(point) &&
    insideAddisServiceRadius(point)
      ? point
      : ADDIS_CENTER;

  const cacheKey = [
    language,
    q.normalize("NFKC").toLocaleLowerCase(),
    proximity.lat.toFixed(3),
    proximity.lng.toFixed(3),
  ].join("|");
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL) {
    return response({
      status: "ready",
      results: cached.results,
      coverage: "addis-100km",
      cached: true,
    });
  }

  try {
    const local = searchPreviewPlaces(q).map<Result>((place) => ({
      lat: place.lat,
      lng: place.lng,
      name: place.name,
      address: place.address,
      source: "preview",
      confirmed: true,
      provider: "nexride",
      providerPlaceId: `nexride:${place.name}:${place.lat}:${place.lng}`,
      category: place.category,
    }));

    const [geocoded, pois] = await Promise.all([
      geocode(token, q, language, proximity).catch(() => []),
      searchPlaces(token, q, language, proximity).catch(() => []),
    ]);

    const results = rank(
      dedupe([...local, ...pois, ...geocoded]).filter(insideAddisServiceRadius),
      q,
      proximity,
    ).slice(0, 20);

    searchCache.set(cacheKey, { at: Date.now(), results });
    if (searchCache.size > 200) {
      [...searchCache.entries()]
        .sort((a, b) => a[1].at - b[1].at)
        .slice(0, 50)
        .forEach(([key]) => searchCache.delete(key));
    }

    return response({
      status: "ready",
      results,
      coverage: "addis-100km",
      sources: ["nexride-local", "mapbox-searchbox", "mapbox-geocoding"],
    });
  } catch {
    return response({ status: "error", results: [] }, 502);
  }
}

import { randomUUID } from "node:crypto";
import { mapboxToken } from "../../../../lib/location";
import { validPoint } from "../../../../lib/nexride-search";

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
  source: "provider";
  confirmed: boolean;
  provider: "mapbox";
  providerPlaceId?: string;
  category?: string;
};

const normalizeFeature = (feature: {
  geometry?: { coordinates?: unknown[] };
  properties?: {
    name?: unknown;
    full_address?: unknown;
    place_formatted?: unknown;
    match_code?: { confidence?: unknown };
    feature_type?: unknown;
    mapbox_id?: unknown;
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
    name;
  return {
    ...point,
    name,
    address,
    source: "provider",
    confirmed: props?.match_code?.confidence !== "low",
    provider: "mapbox",
    providerPlaceId:
      typeof props?.mapbox_id === "string" ? props.mapbox_id : undefined,
    category:
      typeof props?.feature_type === "string" ? props.feature_type : undefined,
  };
};

const dedupe = (results: Result[]) => {
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = `${item.name.toLocaleLowerCase()}|${item.lat.toFixed(5)}|${item.lng.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

async function geocode(
  token: string,
  q: string,
  language: "en" | "am",
): Promise<Result[]> {
  const query = new URLSearchParams({
    access_token: token,
    q,
    country: "et",
    proximity: "38.775,9.008",
    bbox: "38.66,8.84,38.91,9.11",
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
): Promise<Result[]> {
  // Search Box complements geocoding with POIs/businesses such as hospitals,
  // schools, hotels, restaurants, banks and other named Addis destinations.
  const session = randomUUID();
  const params = new URLSearchParams({
    q,
    access_token: token,
    session_token: session,
    country: "ET",
    proximity: "38.775,9.008",
    bbox: "38.66,8.84,38.91,9.11",
    limit: "6",
    language: language === "am" ? "am" : "en",
  });
  const suggest = await fetch(
    `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`,
    { signal: AbortSignal.timeout(7000), cache: "no-store" },
  );
  if (!suggest.ok) return [];
  const payload = await suggest.json();
  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.slice(0, 6)
    : [];

  const rows = await Promise.all(
    suggestions.map(async (suggestion: { mapbox_id?: unknown }) => {
      if (typeof suggestion.mapbox_id !== "string") return null;
      const retrieve = new URLSearchParams({
        access_token: token,
        session_token: session,
      });
      try {
        const result = await fetch(
          `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(
            suggestion.mapbox_id,
          )}?${retrieve}`,
          { signal: AbortSignal.timeout(5000), cache: "no-store" },
        );
        if (!result.ok) return null;
        const data = await result.json();
        const feature = Array.isArray(data.features) ? data.features[0] : null;
        return feature ? normalizeFeature(feature) : null;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((item): item is Result => !!item);
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
  )
    return response({ status: "invalid", results: [] }, 400);

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
        .filter((item: Result | null): item is Result => !!item);
      return response({ status: "ready", results });
    } catch {
      return response({ status: "error", results: [] }, 502);
    }
  }

  try {
    const [geocoded, pois] = await Promise.all([
      geocode(token, q, language).catch(() => []),
      searchPlaces(token, q, language).catch(() => []),
    ]);
    const results = dedupe([...pois, ...geocoded]).slice(0, 12);
    if (!results.length)
      return response({ status: "ready", results: [] });
    return response({ status: "ready", results });
  } catch {
    return response({ status: "error", results: [] }, 502);
  }
}

import { mapboxToken } from "../../../../lib/location";

type Suggestion = {
  id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
};

const SEARCH_CACHE_TTL_MS = 90_000;
const cache = new Map<string, { time: number; results: Suggestion[] }>();

function respond(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (
    query.length < 3 ||
    query.length > 100 ||
    /[<>;]/.test(query) ||
    query.split(/\s+/).length > 14
  ) {
    return respond({ status: "invalid", results: [] }, 400);
  }

  const token = mapboxToken();
  if (!token) return respond({ status: "unavailable", results: [] }, 503);

  const key = query.normalize("NFKC").toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < SEARCH_CACHE_TTL_MS) {
    return respond({ status: "ready", results: cached.results });
  }

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    country: "et",
    language: "en",
    limit: "7",
    autocomplete: "true",
  });
  try {
    const result = await fetch(
      "https://api.mapbox.com/search/geocode/v6/forward?" + params,
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!result.ok) throw new Error("mapbox_places_unavailable");
    const body = await result.json();
    const features = Array.isArray(body.features) ? body.features : [];
    const suggestions: Suggestion[] = [];
    const seen = new Set<string>();

    for (const feature of features) {
      const lng = Number(feature?.geometry?.coordinates?.[0]);
      const lat = Number(feature?.geometry?.coordinates?.[1]);
      const name = typeof feature?.properties?.name === "string"
        ? feature.properties.name.trim() : "";
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) ||
          lat < 3 || lat > 15 || lng < 33 || lng > 48) continue;

      const label = typeof feature?.properties?.place_formatted === "string"
        ? feature.properties.place_formatted.trim() : "Ethiopia";
      const id = typeof feature?.properties?.mapbox_id === "string"
        ? feature.properties.mapbox_id : lat + "," + lng;
      if (seen.has(id)) continue;
      seen.add(id);
      suggestions.push({
        id: id.slice(0, 160),
        name: name.slice(0, 120),
        label: label.slice(0, 220),
        lat,
        lng,
      });
    }

    cache.set(key, { time: Date.now(), results: suggestions });
    if (cache.size > 150) {
      for (const oldKey of [...cache.keys()].slice(0, 40)) cache.delete(oldKey);
    }

    return respond({ status: "ready", results: suggestions });
  } catch {
    return respond({ status: "error", results: [] }, 502);
  }
}

import { mapboxToken } from "../../../../lib/location";
import { validPoint } from "../../../../lib/nexride-search";
const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
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
  const query = new URLSearchParams({
    access_token: token,
    limit: reverse ? "1" : "6",
    language,
  });
  if (reverse) {
    query.set("latitude", String(point.lat));
    query.set("longitude", String(point.lng));
  } else {
    query.set("q", q);
    query.set("country", "et");
    query.set("proximity", "38.775,9.008");
  }
  try {
    const result = await fetch(
      `https://api.mapbox.com/search/geocode/v6/${reverse ? "reverse" : "forward"}?${query}`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" },
    );
    if (!result.ok) throw new Error("Geocoding failed");
    const data = await result.json();
    const results = (data.features || []).flatMap(
      (feature: {
        geometry?: { coordinates: number[] };
        properties?: {
          name?: string;
          full_address?: string;
          place_formatted?: string;
          match_code?: { confidence?: string };
        };
      }) => {
        const coords = feature.geometry?.coordinates;
        const p = { lat: coords?.[1], lng: coords?.[0] };
        const props = feature.properties;
        if (
          !validPoint(p) ||
          typeof props?.name !== "string" ||
          !props.name.trim()
        )
          return [];
        return [
          {
            ...p,
            name: props.name,
            address:
              (typeof props.full_address === "string" && props.full_address) ||
              (typeof props.place_formatted === "string" &&
                props.place_formatted) ||
              props.name,
            source: "provider",
            confirmed: props.match_code?.confidence !== "low",
          },
        ];
      },
    );
    return response({ status: "ready", results });
  } catch {
    return response({ status: "error", results: [] }, 502);
  }
}

import { mapboxToken, routeBetween } from "../../../lib/location";

type Point = { lat: number; lng: number; name: string };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function resolvePlace(query: string, token: string): Promise<Point> {
  // Oromiffa Mattuu is commonly indexed as Metu/Mettu in mapping providers.
  // Use the geographically specific lookup to avoid the similarly named MetU near Addis Ababa.
  const lookup = ["mattuu", "matuu", "metu", "mettu"].includes(query.trim().toLowerCase())
    ? "Metu Ethiopia"
    : query;
  const params = new URLSearchParams({
    q: lookup, country: "et", limit: "5", language: "en",
    access_token: token,
  });
  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, {
    signal: AbortSignal.timeout(9000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("geocode_unavailable");
  const data = await response.json();
  const features = Array.isArray(data.features) ? data.features : [];
  const normalized = query.normalize("NFKC").toLowerCase().trim();
  const best = features.find((entry: { properties?: { name?: string } }) =>
    entry.properties?.name?.normalize("NFKC").toLowerCase() === normalized,
  ) || features[0];
  const coords = best?.geometry?.coordinates;
  const lng = Number(coords?.[0]);
  const lat = Number(coords?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new Error("place_not_found");
  return { lat, lng, name: String(best?.properties?.name || query).slice(0, 120) };
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ status: "invalid" }, 400); }
  const value = body as { origin?: unknown; destination?: unknown } | null;
  const origin = typeof value?.origin === "string" ? value.origin.trim() : "";
  const destination = typeof value?.destination === "string" ? value.destination.trim() : "";
  if (!origin || !destination || origin.length > 100 || destination.length > 100 ||
    /[<>;]/.test(origin + destination)) return reply({ status: "invalid" }, 400);
  const token = mapboxToken();
  if (!token) return reply({ status: "unavailable", message: "Map service is not configured." }, 503);
  try {
    const [start, end] = await Promise.all([resolvePlace(origin, token), resolvePlace(destination, token)]);
    const separation = Math.hypot(start.lat - end.lat, start.lng - end.lng);
    if (separation < 0.0003) return reply({ status: "same" }, 422);
    // Explorer routes are informational. Never bypass the separate booking coverage rules.
    const route = await routeBetween([start, end], { profile: "driving", requireProvider: true, steps: false });
    if (!route.geometry?.length) throw new Error("route_unavailable");
    return reply({
      status: "ready", origin: start, destination: end,
      distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds,
      geometry: route.geometry, provider: "mapbox",
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "place_not_found"
      ? "A location could not be found in Ethiopia. Try a city or town name."
      : "The route could not be calculated. Check the locations or try again.";
    return reply({ status: "error", message }, 422);
  }
}

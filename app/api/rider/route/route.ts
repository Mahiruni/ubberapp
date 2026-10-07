import {
  routeAlternatives,
  haversineMeters,
  mapboxToken,
} from "../../../../lib/location";
import {
  serviceBounds,
  insideBounds,
  validPoint,
} from "../../../../lib/nexride-search";

const response = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const coverage = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
  let body;
  try {
    body = await request.json();
  } catch {
    return response({ status: "invalid" }, 400);
  }

  const { pickup, destination } = body || {};
  if (!validPoint(pickup) || !validPoint(destination))
    return response({ status: "invalid" }, 400);

  if (
    !insideBounds(pickup, coverage.bounds) ||
    !insideBounds(destination, coverage.bounds)
  )
    return response({ status: "coverage", coverage }, 422);

  if (haversineMeters(pickup, destination) < 30)
    return response({ status: "same", coverage }, 422);

  if (!mapboxToken())
    return response({ status: "unavailable", coverage }, 503);

  try {
    const alternatives = await routeAlternatives([pickup, destination], {
      profile: "driving-traffic",
      alternatives: true,
      requireProvider: true,
    });
    return response({
      status: "ready",
      route: alternatives[0],
      alternatives,
      updatedAt: Date.now(),
      coverage,
    });
  } catch {
    return response({ status: "error", coverage }, 502);
  }
}

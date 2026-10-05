import { previewFares } from "../../../../lib/nexride-booking";
import {
  validPoint,
  serviceBounds,
  insideBounds,
} from "../../../../lib/nexride-search";
import { haversineMeters } from "../../../../lib/location";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  try {
    const { pickup, destination } = await request.json();
    const area = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
    if (!validPoint(pickup) || !validPoint(destination))
      return reply({ status: "invalid" }, 400);
    if (
      !insideBounds(pickup, area.bounds) ||
      !insideBounds(destination, area.bounds) ||
      haversineMeters(pickup, destination) < 30
    )
      return reply({ status: "invalid_journey" }, 422);
    // No rider pricing/availability service is connected. Never infer arrival times from routing.
    return reply(previewFares({ pickup, destination }));
  } catch {
    return reply({ status: "invalid" }, 400);
  }
}

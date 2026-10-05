import { previewFares } from "../../../../lib/nexride-booking";
import { liveFareSet } from "../../../../lib/nexride-live-pricing";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
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

    const authorized = await authorizedRequestSupabase(request);
    if (!authorized) {
      // Guests keep the non-booking preview experience.
      return reply(previewFares({ pickup, destination }));
    }

    const { data: profile, error } = await authorized.client
      .from("profiles")
      .select("role,account_status")
      .eq("id", authorized.user.id)
      .maybeSingle();

    if (
      error ||
      !profile ||
      profile.role !== "rider" ||
      profile.account_status !== "active"
    ) {
      return reply({ status: "forbidden" }, 403);
    }

    return reply(liveFareSet({ pickup, destination }));
  } catch {
    return reply({ status: "invalid" }, 400);
  }
}

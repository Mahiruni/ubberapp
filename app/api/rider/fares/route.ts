import { previewFares } from "../../../../lib/nexride-booking";
import { liveFareSet } from "../../../../lib/nexride-live-pricing";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import {
  validPoint,
  serviceBounds,
  insideBounds,
  insideAddisServiceRadius,
} from "../../../../lib/nexride-search";
import { haversineMeters } from "../../../../lib/location";

const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let journey: unknown;
  try {
    journey = await request.json();
  } catch {
    return reply({ status: "invalid" }, 400);
  }

  const { pickup, destination } =
    (journey && typeof journey === "object" ? journey : {}) as {
      pickup?: unknown;
      destination?: unknown;
    };
  if (!validPoint(pickup) || !validPoint(destination))
    return reply({ status: "invalid" }, 400);

  const area = serviceBounds(process.env.NEXRIDE_SERVICE_BOUNDS);
  if (
    !insideBounds(pickup, area.bounds) ||
    !insideBounds(destination, area.bounds) ||
    !insideAddisServiceRadius(pickup) ||
    !insideAddisServiceRadius(destination) ||
    haversineMeters(pickup, destination) < 30
  )
    return reply({ status: "invalid_journey" }, 422);

  // Display sample fares for guests and non-Rider roles. These never enable
  // real bookings and must never be labeled as confirmed service quotes.
  const authorized = await authorizedRequestSupabase(request).catch(() => null);
  if (!authorized) return reply(previewFares({ pickup, destination }));

  try {
    // Validate the Rider using the server's authoritative profile lookup.
    // Client-side RLS failures must not masquerade as missing fare prices.
    const { data: profile, error } = await serverAdminSupabase()
      .from("profiles")
      .select("role,account_status")
      .eq("id", authorized.user.id)
      .maybeSingle();

    if (error) {
      console.error("nexride_fares_profile_lookup_failed", {
        code: error.code || "unknown",
      });
      return reply({ status: "temporarily_unavailable" }, 503);
    }
    if (!profile || profile.account_status !== "active") {
      return reply({ status: "profile_unavailable" }, 403);
    }
    if (profile.role !== "rider") {
      return reply(previewFares({ pickup, destination }));
    }

    return reply(liveFareSet({ pickup, destination }));
  } catch {
    console.error("nexride_fares_service_unavailable");
    return reply({ status: "temporarily_unavailable" }, 503);
  }
}

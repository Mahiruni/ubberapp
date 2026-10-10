import { previewFares } from "../../../../lib/nexride-booking";
import { liveFareSet } from "../../../../lib/nexride-live-pricing";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { resolveRiderEligibility, riderEligibilityHttpStatus } from "../../../../lib/nexride-rider-eligibility";
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

  // A guest may inspect non-bookable sample fares. Invalid bearer credentials
  // must return 401 so the client can refresh its session instead of silently
  // downgrading an authenticated Rider to preview mode.
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!authorization) return reply(previewFares({ pickup, destination }));

  const authorized = await authorizedRequestSupabase(request).catch(() => null);
  if (!authorized) return reply({ status: "session_expired" }, 401);

  try {
    const eligibility = await resolveRiderEligibility(
      serverAdminSupabase(), authorized.user.id,
    );
    if (eligibility !== "eligible")
      return reply({ status: eligibility }, riderEligibilityHttpStatus(eligibility));

    return reply(liveFareSet({ pickup, destination }));
  } catch {
    console.error("nexride_fares_service_unavailable");
    return reply({ status: "temporarily_unavailable" }, 503);
  }
}

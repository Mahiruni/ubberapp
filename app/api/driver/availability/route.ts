import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

type CleanLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updated_at: string;
};

function cleanLocation(value: unknown): CleanLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const accuracy =
    record.accuracy === null || record.accuracy === undefined
      ? null
      : Number(record.accuracy);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100000)) return null;

  return {
    latitude,
    longitude,
    accuracy,
    updated_at: new Date().toISOString(),
  };
}

export async function PATCH(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ status: "invalid_request" }, 400);
  }

  const hasOnline = typeof body.online === "boolean";
  const location = cleanLocation(body.location);

  if (!hasOnline && !location) return reply({ status: "invalid_request" }, 400);
  if (hasOnline && body.online === true && !location)
    return reply({ status: "location_required" }, 400);

  try {
    const admin = serverAdminSupabase();
    const [profileResult, driverResult] = await Promise.all([
      admin
        .from("profiles")
        .select("role,account_status")
        .eq("id", authorized.user.id)
        .maybeSingle(),
      admin
        .from("drivers")
        .select("review_status,rejection_reason,is_online,rating")
        .eq("id", authorized.user.id)
        .maybeSingle(),
    ]);

    if (profileResult.error || driverResult.error)
      return reply({ status: "driver_status_unavailable" }, 503);

    if (profileResult.data?.role !== "driver" || !driverResult.data)
      return reply({ status: "driver_required" }, 403);

    const current = driverResult.data;
    const goingOffline = hasOnline && body.online === false;
    const wantsOnline = hasOnline ? body.online === true : current.is_online === true;

    // Taking a driver offline is a safety cleanup operation. It must remain
    // available even if the account was just suspended/inactivated.
    if (!goingOffline && profileResult.data.account_status !== "active")
      return reply({ status: "account_inactive" }, 403);

    if (wantsOnline && current.review_status !== "approved")
      return reply(
        {
          status: "driver_not_approved",
          reviewStatus: current.review_status,
          rejectionReason: current.rejection_reason || "",
        },
        409,
      );

    if (goingOffline && current.is_online !== true) {
      return reply({
        status: "ready",
        driver: current,
      });
    }

    if (!hasOnline && current.is_online !== true)
      return reply({ status: "driver_offline" }, 409);

    const patch: Record<string, unknown> = {};
    if (hasOnline) patch.is_online = body.online === true;
    if (location) patch.location = location;

    // Offline-only updates should run in the authenticated driver's RLS
    // context. Besides enforcing ownership, this preserves auth.uid() for any
    // database triggers that depend on the acting user. Location/online writes
    // continue to use the server client because location is not a client-
    // writable driver column.
    const writeClient = goingOffline && !location ? authorized.client : admin;
    const { data, error } = await writeClient
      .from("drivers")
      .update(patch)
      .eq("id", authorized.user.id)
      .select("review_status,rejection_reason,is_online,rating")
      .single();

    if (error || !data) {
      console.error("driver_availability_update_failed", {
        driverId: authorized.user.id,
        operation: goingOffline ? "offline" : hasOnline ? "online" : "location",
        code: error?.code || "",
        message: error?.message || "",
        details: error?.details || "",
        hint: error?.hint || "",
      });
      const message = error?.message || "";
      if (/approval|approved/i.test(message))
        return reply({ status: "driver_not_approved" }, 409);
      return reply({ status: "availability_update_failed" }, 500);
    }

    return reply({
      status: "ready",
      driver: data,
    });
  } catch {
    return reply({ status: "availability_service_unavailable" }, 503);
  }
}

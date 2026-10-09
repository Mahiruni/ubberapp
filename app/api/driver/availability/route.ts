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
        .select("review_status,rejection_reason,is_online,rating,vehicle,vehicle_plate")
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

    const vehicleModel =
      String(current.vehicle || authorized.user.user_metadata?.vehicle || "").trim();
    const vehiclePlate =
      String(
        current.vehicle_plate ||
          authorized.user.user_metadata?.vehicle_plate ||
          "",
      ).trim();
    const vehicleColor = String(
      authorized.user.user_metadata?.vehicle_color || "",
    ).trim();

    if (wantsOnline && (!vehicleModel || !vehiclePlate || !vehicleColor)) {
      if (current.is_online === true) {
        await authorized.client
          .from("drivers")
          .update({ is_online: false })
          .eq("id", authorized.user.id);
      }
      return reply(
        {
          status: "vehicle_identity_incomplete",
          missing: {
            vehicle: !vehicleModel,
            color: !vehicleColor,
            plate: !vehiclePlate,
          },
        },
        409,
      );
    }

    if (goingOffline && current.is_online !== true) {
      return reply({
        status: "ready",
        driver: current,
      });
    }

    if (!hasOnline && current.is_online !== true)
      return reply({ status: "driver_offline" }, 409);

    const selectFields = "review_status,rejection_reason,is_online,rating,vehicle,vehicle_plate";
    let updatedDriver = current;

    // Keep location writes on the trusted server client because the location
    // column is intentionally not writable by browser clients. Do not include
    // is_online in this update: the online-session trigger lives in the
    // private schema and must run with the authenticated driver's role.
    if (location) {
      const { data: locationData, error: locationError } = await admin
        .from("drivers")
        .update({ location })
        .eq("id", authorized.user.id)
        .select(selectFields)
        .single();

      if (locationError || !locationData) {
        console.error("driver_availability_update_failed", {
          driverId: authorized.user.id,
          operation: "location",
          code: locationError?.code || "",
          message: locationError?.message || "",
          details: locationError?.details || "",
          hint: locationError?.hint || "",
        });
        return reply({ status: "availability_update_failed" }, 500);
      }

      updatedDriver = locationData;
    }

    // Always change is_online in the authenticated driver's RLS context.
    // Authenticated drivers have the required private-schema access for the
    // online-session trigger, while ownership remains constrained by RLS.
    if (hasOnline) {
      const { data: onlineData, error: onlineError } = await authorized.client
        .from("drivers")
        .update({ is_online: body.online === true })
        .eq("id", authorized.user.id)
        .select(selectFields)
        .single();

      if (onlineError || !onlineData) {
        console.error("driver_availability_update_failed", {
          driverId: authorized.user.id,
          operation: goingOffline ? "offline" : "online",
          code: onlineError?.code || "",
          message: onlineError?.message || "",
          details: onlineError?.details || "",
          hint: onlineError?.hint || "",
        });
        const message = onlineError?.message || "";
        if (/approval|approved/i.test(message))
          return reply({ status: "driver_not_approved" }, 409);
        return reply({ status: "availability_update_failed" }, 500);
      }

      updatedDriver = onlineData;

      if (body.online === true && current.is_online !== true) {
        const { error: dispatchError } = await admin.rpc(
          "nexride_dispatch_waiting_for_driver_server",
          { p_driver_id: authorized.user.id },
        );
        if (dispatchError) {
          console.warn("nexride_waiting_dispatch_deferred", {
            code: dispatchError.code || "unknown",
          });
        }
      }
    }

    return reply({
      status: "ready",
      driver: updatedDriver,
    });
  } catch {
    return reply({ status: "availability_service_unavailable" }, 503);
  }
}

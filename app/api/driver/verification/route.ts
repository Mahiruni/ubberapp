import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { normalizeVehicleColor } from "../../../../lib/nexride-vehicle";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ status: "unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return reply({ status: "invalid_request" }, 400);
  }

  const licenseNumber = text(body.licenseNumber, 120);
  const licenseExpiry = text(body.licenseExpiry, 20);
  const vehicle = text(body.vehicle, 120);
  const vehicleColor = normalizeVehicleColor(body.vehicleColor);
  const vehiclePlate = text(body.vehiclePlate, 60);
  const licenseDocumentPath = text(body.licenseDocumentPath, 300);
  const vehicleRegistrationPath = text(body.vehicleRegistrationPath, 300);
  const prefix = authorized.user.id + "/";

  if (
    !licenseNumber ||
    !licenseExpiry ||
    !vehicle ||
    !vehicleColor ||
    !vehiclePlate ||
    !licenseDocumentPath.startsWith(prefix) ||
    !vehicleRegistrationPath.startsWith(prefix)
  ) {
    return reply({ status: "invalid_verification" }, 400);
  }

  const expiry = new Date(licenseExpiry + "T00:00:00Z");
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())
    return reply({ status: "license_expired" }, 400);

  try {
    const admin = serverAdminSupabase();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,account_status")
      .eq("id", authorized.user.id)
      .maybeSingle();

    if (profileError) return reply({ status: "profile_unavailable" }, 503);
    if (profile?.role !== "driver") return reply({ status: "driver_required" }, 403);
    if (profile.account_status !== "active") return reply({ status: "account_inactive" }, 403);

    const metadataResult = await admin.auth.admin.updateUserById(
      authorized.user.id,
      {
        user_metadata: {
          ...(authorized.user.user_metadata || {}),
          vehicle,
          vehicle_color: vehicleColor,
          vehicle_plate: vehiclePlate,
        },
      },
    );

    if (metadataResult.error)
      return reply({ status: "vehicle_identity_save_failed" }, 500);

    const commonUpdate = {
      license_number: licenseNumber,
      license_expiry: licenseExpiry,
      vehicle,
      vehicle_plate: vehiclePlate,
      license_document_path: licenseDocumentPath,
      vehicle_registration_path: vehicleRegistrationPath,
    };

    let result = await admin
      .from("drivers")
      .update({ ...commonUpdate, vehicle_color: vehicleColor })
      .eq("id", authorized.user.id)
      .select("review_status,rejection_reason")
      .single();

    if (
      result.error &&
      /vehicle_color|schema cache|column/i.test(result.error.message || "")
    ) {
      result = await admin
        .from("drivers")
        .update(commonUpdate)
        .eq("id", authorized.user.id)
        .select("review_status,rejection_reason")
        .single();
    }

    const { data, error } = result;

    if (error || !data) {
      const message = error?.message || "";
      if (/approved or suspended/i.test(message))
        return reply({ status: "verification_locked" }, 409);
      if (/identity_ownership_review_required|existing_identity_document_must_be_reviewed|duplicate key|identity document/i.test(message) || error?.code==="23505")
        return reply({ status: "identity_ownership_review_required" }, 409);
      return reply({ status: "verification_save_failed" }, 500);
    }

    return reply({
      status: "submitted",
      reviewStatus: data.review_status,
      rejectionReason: data.rejection_reason || "",
    });
  } catch {
    return reply({ status: "verification_service_unavailable" }, 503);
  }
}

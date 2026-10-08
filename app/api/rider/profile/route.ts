import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { canReuseRiderAccount } from "../../../../lib/nexride-identity";

const reply = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function cleanPhone(value: unknown) {
  if (typeof value !== "string") return "";
  const phone = value.trim().slice(0, 25);
  const digits = phone.replace(/\D/g, "");
  return /^\+?[\d\s()-]{7,25}$/.test(phone) && digits.length >= 7 && digits.length <= 15
    ? phone
    : "";
}

export async function POST(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return reply({ error: "auth_required" }, 401);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {}

  const fullName = cleanName(body.fullName);
  const phone = cleanPhone(body.phone);

  try {
    const admin = serverAdminSupabase();
    const { data: existing, error: lookupError } = await admin
      .from("profiles")
      .select("id,role,account_status,full_name,phone")
      .eq("id", authorized.user.id)
      .maybeSingle();

    if (lookupError) return reply({ error: "profile_lookup_failed" }, 503);

    if (existing) {
      // One real Supabase identity may have Rider and Driver access.
      // Never rewrite a driver's primary role just to restore Rider.
      if (existing.role === "admin") {
        return reply({ error: "role_conflict" }, 409);
      }
      if (existing.account_status && existing.account_status !== "active") {
        return reply({ error: "account_inactive" }, 403);
      }

      if (existing.role === "driver") {
        const { data: membership, error: membershipError } = await admin
          .from("account_roles")
          .select("role")
          .eq("user_id", authorized.user.id)
          .eq("role", "rider")
          .maybeSingle();
        if (membershipError) return reply({ error: "role_lookup_failed" }, 503);
        if (!canReuseRiderAccount(existing.role, membership?.role === "rider"))
          return reply({ error: "role_conflict" }, 409);
        return reply({ status: "ready", role: "rider", reusedIdentity: true });
      }

      const patch: Record<string, unknown> = {};
      if (existing.role !== "rider") patch.role = "rider";
      if (!existing.full_name && fullName) patch.full_name = fullName;
      if (!existing.phone && phone) patch.phone = phone;

      if (Object.keys(patch).length) {
        const { error: updateError } = await admin
          .from("profiles")
          .update(patch)
          .eq("id", authorized.user.id);
        if (updateError) return reply({ error: "profile_update_failed" }, 503);
      }

      return reply({ status: "ready", role: "rider" });
    }

    const { data: city } = await admin
      .from("cities")
      .select("id")
      .eq("name", "Addis Ababa")
      .maybeSingle();

    const profile: Record<string, unknown> = {
      id: authorized.user.id,
      role: "rider",
      account_status: "active",
      full_name:
        fullName ||
        (typeof authorized.user.user_metadata?.full_name === "string"
          ? cleanName(authorized.user.user_metadata.full_name)
          : "") ||
        authorized.user.email?.split("@")[0] ||
        "Rider",
      phone: phone || null,
    };

    if (city?.id) profile.city_id = city.id;

    const { error: insertError } = await admin.from("profiles").insert(profile);
    if (insertError) return reply({ error: "profile_create_failed" }, 503);

    return reply({ status: "ready", role: "rider" }, 201);
  } catch {
    return reply({ error: "profile_service_unavailable" }, 503);
  }
}

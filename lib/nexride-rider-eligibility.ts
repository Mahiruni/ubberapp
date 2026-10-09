import type { SupabaseClient } from "@supabase/supabase-js";

export type RiderEligibility =
  | "eligible"
  | "account_inactive"
  | "rider_account_required"
  | "rider_profile_incomplete"
  | "driver_offline_required"
  | "temporarily_unavailable";

/**
 * Use the same authoritative checks for live fare quotes and Rider bookings.
 * In particular, an approved Driver may also be a Rider with the same Auth ID.
 * Never trust editable Auth user_metadata or a local role switch for access.
 */
export async function resolveRiderEligibility(
  admin: SupabaseClient,
  userId: string,
): Promise<RiderEligibility> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,account_status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return "temporarily_unavailable";
  if (!profile || profile.account_status !== "active") return "account_inactive";
  // Existing Admin booking access remains unchanged.
  if (profile.role === "admin") return "eligible";
  if (profile.role !== "rider" && profile.role !== "driver")
    return "rider_account_required";

  const [membership, onboarding] = await Promise.all([
    admin.from("account_roles").select("role")
      .eq("user_id", userId).eq("role", "rider").maybeSingle(),
    admin.from("account_role_onboarding").select("status")
      .eq("user_id", userId).eq("role", "rider").maybeSingle(),
  ]);
  if (membership.error || onboarding.error) return "temporarily_unavailable";
  if (membership.data?.role !== "rider") return "rider_account_required";
  if (onboarding.data?.status === "suspended") return "account_inactive";
  if (onboarding.data?.status !== "completed") return "rider_profile_incomplete";

  if (profile.role === "rider") return "eligible";

  const [driver, trip] = await Promise.all([
    admin.from("drivers").select("is_online").eq("id", userId).maybeSingle(),
    admin.from("ride_requests").select("id")
      .eq("assigned_driver_id", userId)
      .in("status", ["accepted", "arrived_pickup", "in_trip"])
      .limit(1).maybeSingle(),
  ]);
  if (driver.error || trip.error) return "temporarily_unavailable";
  if (!driver.data || driver.data.is_online || trip.data)
    return "driver_offline_required";
  return "eligible";
}

export function riderEligibilityHttpStatus(state: RiderEligibility): number {
  return state === "temporarily_unavailable" ? 503 : 403;
}

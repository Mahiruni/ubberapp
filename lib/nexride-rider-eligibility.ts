import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Rider authorization; never infer a usable role from editable
 * user_metadata, a browser toggle or a client-supplied identity.
 *
 * A Driver who has explicitly activated Rider membership may book only when
 * offline and not already serving a trip. Preserve legacy admin access.
 */
export function riderAccessAllowed(
  primaryRole: string,
  accountStatus: string,
  riderMembership: boolean,
  driverOnline = false,
  onActiveDriverTrip = false,
): boolean {
  if (accountStatus !== "active") return false;
  if (primaryRole === "rider" || primaryRole === "admin") return true;
  return primaryRole === "driver" && riderMembership &&
    !driverOnline && !onActiveDriverTrip;
}

export async function resolveRiderEligibility(
  admin: SupabaseClient,
  userId: string,
): Promise<"eligible" | "forbidden" | "unavailable"> {
  const { data: profile, error } = await admin.from("profiles")
    .select("role,account_status").eq("id", userId).maybeSingle();
  if (error) return "unavailable";
  if (!profile || profile.account_status !== "active") return "forbidden";
  if (riderAccessAllowed(profile.role, profile.account_status, false)) return "eligible";
  if (profile.role !== "driver") return "forbidden";

  const [membership, driver, busy] = await Promise.all([
    admin.from("account_roles").select("role")
      .eq("user_id", userId).eq("role", "rider").maybeSingle(),
    admin.from("drivers").select("is_online").eq("id", userId).maybeSingle(),
    admin.from("ride_requests").select("id")
      .eq("assigned_driver_id", userId)
      .in("status", ["accepted", "arrived_pickup", "in_trip"])
      .limit(1).maybeSingle(),
  ]);
  if (membership.error || driver.error || busy.error) return "unavailable";
  if (!driver.data) return "forbidden";
  return riderAccessAllowed(
    profile.role,
    profile.account_status,
    membership.data?.role === "rider",
    driver.data.is_online === true,
    !!busy.data,
  ) ? "eligible" : "forbidden";
}

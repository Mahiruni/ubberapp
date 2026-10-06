import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

function cleanRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function getAccountRole(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return cleanRole(data?.role);
}

export async function resolveSessionRole(session: Session): Promise<string> {
  const databaseRole = await getAccountRole(session.user.id);
  if (databaseRole) return databaseRole;

  // Only fall back when no profile row exists yet (for first-run onboarding).
  return cleanRole(session.user.user_metadata?.role);
}

import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { withOperationTimeout } from "./nexride-operation";

function cleanRole(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function getAccountRole(userId: string): Promise<string> {
  const { data, error } = await withOperationTimeout(supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    // Startup owns the visible retry action. Do not hide a failed role lookup
    // behind repeated SDK requests or fall back to a different account role.
    .maybeSingle().retry(false));

  if (error) throw error;
  return cleanRole(data?.role);
}

export async function resolveSessionRole(session: Session): Promise<string> {
  // Auth user_metadata is editable by its owner. It can prefill forms, but
  // cannot establish an Admin or Driver role, even before profile bootstrap.
  return getAccountRole(session.user.id);
}

import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./runtime-config";

export function serverAdminSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(publicConfig.supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

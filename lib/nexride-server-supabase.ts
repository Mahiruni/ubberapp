import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { publicConfig } from "./runtime-config";

export type RequestSupabase = {
  client: SupabaseClient;
  user: User;
};

export async function authorizedRequestSupabase(request: Request): Promise<RequestSupabase | null> {
  const header = request.headers.get("authorization")?.trim() || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;

  const token = match[1];
  const client = createClient(publicConfig.supabaseUrl, publicConfig.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  return { client, user: data.user };
}

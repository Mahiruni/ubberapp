export async function nexrideApiHeaders(json = false) {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  if (typeof window === "undefined") return headers;

  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}

  return headers;
}

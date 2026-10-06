async function sessionToken(forceRefresh = false) {
  if (typeof window === "undefined") return "";

  const { supabase } = await import("./supabase");

  if (forceRefresh) {
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token || "";
  }

  const current = await supabase.auth.getSession();
  let session = current.data.session;

  const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
  const expiresSoon = expiresAt > 0 && expiresAt <= Date.now() + 60_000;

  if (!session?.access_token || expiresSoon) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }

  return session?.access_token || "";
}

export async function nexrideApiHeaders(json = false) {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";

  try {
    const token = await sessionToken(false);
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {}

  return headers;
}

export async function nexrideApiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const makeRequest = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers || {});
    const token = await sessionToken(forceRefresh).catch(() => "");

    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (
      init.body &&
      !(init.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(input, { ...init, headers });
  };

  let response = await makeRequest(false);
  if (response.status === 401) {
    response = await makeRequest(true);
  }
  return response;
}

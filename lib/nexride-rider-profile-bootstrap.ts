import type { Session } from "@supabase/supabase-js";

export class RiderProfileBootstrapError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RiderProfileBootstrapError";
  }
}

export async function ensureRiderProfile(
  session: Session,
  input: { fullName?: string; phone?: string } = {},
) {
  const response = await fetch("/api/rider/profile", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fullName:
        input.fullName ??
        (typeof session.user.user_metadata?.full_name === "string"
          ? session.user.user_metadata.full_name
          : ""),
      phone:
        input.phone ??
        (typeof session.user.user_metadata?.phone === "string"
          ? session.user.user_metadata.phone
          : ""),
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || body?.status !== "ready") {
    throw new RiderProfileBootstrapError(
      typeof body?.error === "string" ? body.error : "profile_unavailable",
    );
  }

  return body;
}

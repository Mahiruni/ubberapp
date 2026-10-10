const PRODUCTION_AUTH_ORIGIN = "https://ubberapp.vercel.app";

export function nexrideAuthRedirectUrl(path: string) {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const origin =
    process.env.NODE_ENV === "production"
      ? PRODUCTION_AUTH_ORIGIN
      : browserOrigin || configuredAppUrl;

  if (!origin) {
    throw new Error("Unable to resolve the NexRide application URL.");
  }

  const redirect = new URL(path, origin.endsWith("/") ? origin : `${origin}/`);
  if (!path.startsWith("/") || redirect.origin !== new URL(origin).origin) {
    throw new Error("Auth redirects must use a path on the NexRide application.");
  }

  return redirect.toString();
}

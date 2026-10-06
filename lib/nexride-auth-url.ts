export function nexrideAuthRedirectUrl(path: string) {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const origin =
    process.env.NODE_ENV === "production" && configuredAppUrl
      ? configuredAppUrl
      : browserOrigin || configuredAppUrl;

  if (!origin) {
    throw new Error("Unable to resolve the NexRide application URL.");
  }

  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

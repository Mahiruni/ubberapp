const FALLBACK_URL = "https://ubberapp.vercel.app";

function normalizeSiteUrl(value?: string) {
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : "https://" + value;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

export const NEXRIDE_SITE_URL =
  normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ||
  normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL) ||
  FALLBACK_URL;

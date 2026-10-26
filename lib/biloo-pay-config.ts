import { publicConfig } from "./runtime-config";

export function bilooPayConfiguration() {
  const projectRef = new URL(publicConfig.supabaseUrl).hostname.split(".")[0];
  const productionRef =
    process.env.BILOO_PAY_PRODUCTION_PROJECT_REF?.trim();
  const mode = process.env.PAYMENT_MODE;
  // Test money must never enter the production database, even from a preview inheriting its URL.
  const isolated =
    mode === "live"
      ? projectRef === productionRef && process.env.VERCEL_ENV !== "preview"
      : mode === "test" &&
        projectRef !== productionRef &&
        process.env.VERCEL_ENV !== "production";
  const enabled =
    !!productionRef &&
    process.env.BILOO_PAY_ENABLED === "true" &&
    process.env.BILOO_PAY_VERIFIED_PROJECT_REF === projectRef &&
    isolated;
  return { enabled, projectRef, schemaVersion: "20261026.1" };
}

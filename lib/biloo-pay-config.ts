import { publicConfig } from "./runtime-config";

// Established by the repository + Vercel audit, not by the empty connected project.
const AUDITED_PRODUCTION_PROJECT = "eyyvvwecpyctttiueban";
export function bilooPayConfiguration() {
  const projectRef = new URL(publicConfig.supabaseUrl).hostname.split(".")[0];
  const productionRef =
    process.env.BILOO_PAY_PRODUCTION_PROJECT_REF || AUDITED_PRODUCTION_PROJECT;
  const mode = process.env.PAYMENT_MODE;
  // Test money must never enter the production database, even from a preview inheriting its URL.
  const isolated =
    mode === "live"
      ? projectRef === productionRef && process.env.VERCEL_ENV !== "preview"
      : mode === "test" &&
        projectRef !== productionRef &&
        process.env.VERCEL_ENV !== "production";
  const enabled =
    process.env.BILOO_PAY_ENABLED === "true" &&
    process.env.BILOO_PAY_VERIFIED_PROJECT_REF === projectRef &&
    isolated;
  return { enabled, projectRef, schemaVersion: "20261026.1" };
}

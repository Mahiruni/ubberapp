import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import {
  startPayFixture,
  encryptionSecret,
} from "../tests/fixtures/biloo-pay-server.mjs";
const originalNextEnv = readFileSync("next-env.d.ts", "utf8");
const originalTsConfig = readFileSync("tsconfig.json", "utf8");
rmSync(".next-pay-test", { recursive: true, force: true });
const fixture = await startPayFixture();
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  BILOO_PAY_LOCAL_TEST: "1",
  BILOO_PAY_ENABLED: "true",
  BILOO_PAY_VERIFIED_PROJECT_REF: "127",
  BILOO_PAY_PRODUCTION_PROJECT_REF: "production-fixture",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54391",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-test-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "local-test-service-key",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3007",
  APP_URL: "https://biloo.example.test",
  PAYMENT_MODE: "test",
  PAYMENT_PROVIDER: "chapa",
  NEXRIDE_PAYMENTS_ENABLED: "true",
  NEXRIDE_PAYOUTS_ENABLED: "true",
  BILOO_PAY_PAYOUTS_REVIEWED: "true",
  PAYMENT_SECRET_KEY: "local-test-provider-key",
  PAYMENT_WEBHOOK_SECRET: "local-test-webhook-secret",
  PAYOUT_ENCRYPTION_KEY: encryptionSecret,
  NODE_OPTIONS: `--import=${resolve("tests/fixtures/biloo-pay-provider.mjs")}`,
};
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3007",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
app.stdout.on("data", (b) => {
  logs += b;
});
app.stderr.on("data", (b) => {
  logs += b;
});
let code = 1;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3007/api/payments/config");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready)
    throw Error("Payment test app did not start: " + logs.slice(-3000));
  const test = spawn(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "-c",
      "playwright.pay.config.ts",
    ],
    { env: { ...process.env, BILOO_PAY_LOCAL_TEST: "1" }, stdio: "inherit" },
  );
  code = await new Promise((resolve) => test.on("exit", resolve));
  if (code) console.error(logs.slice(-4500));
} finally {
  if (app.exitCode === null) {
    app.kill("SIGTERM");
    await new Promise((resolve) => app.on("exit", resolve));
  }
  await fixture.close();
  writeFileSync("next-env.d.ts", originalNextEnv);
  writeFileSync("tsconfig.json", originalTsConfig);
}
process.exitCode = code ?? 1;

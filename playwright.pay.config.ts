import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "biloo-pay.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/biloo-pay", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3007",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
          args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        }
      : undefined,
  },
  projects: [
    { name: "android-pay", use: { ...devices["Pixel 7"] } },
    { name: "desktop-pay", use: { ...devices["Desktop Chrome"] } },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // A hung browser suite must report a failed check rather than block a release indefinitely.
  timeout: process.env.CI ? 60_000 : 30_000,
  globalTimeout: process.env.CI ? 23 * 60_000 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    [process.env.CI ? "line" : "list"],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      process.env.PLAYWRIGHT_SERVER_COMMAND ||
      "npm run dev -- --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? {
              executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
              ],
            }
          : undefined,
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? {
              executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
              args: [
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
              ],
            }
          : undefined,
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
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
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
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
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--disable-dev-shm-usage",
              ],
            }
          : undefined,
      },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "webgl.disabled": false,
            "webgl.force-enabled": true,
            "webgl.enable-webgl2": true,
            "webgl.enable-software-renderer": true,
            "gfx.webrender.software": true,
          },
          env: {
            ...process.env,
            LIBGL_ALWAYS_SOFTWARE: "1",
            MOZ_WEBRENDER: "1",
          },
        },
      },
    },
  ],
});

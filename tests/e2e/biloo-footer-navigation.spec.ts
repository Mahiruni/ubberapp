import { test, expect, type Page } from "@playwright/test";

async function mockDriver(page: Page) {
  const id = "22222222-2222-4222-8222-222222222222";
  const user = {
    id, aud: "authenticated", role: "authenticated", email: "driver@example.test",
    app_metadata: {}, user_metadata: { role: "driver", full_name: "Biloo Driver", driver_onboarding_complete: true },
    created_at: "2026-01-01T00:00:00Z",
  };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString("base64url")}.test`;
  const session = {
    access_token: token, refresh_token: "test", expires_at: 4102444800,
    expires_in: 3600, token_type: "bearer", user,
  };
  await page.addInitScript(({ session }) => {
    localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token", JSON.stringify(session));
    localStorage.setItem("nexride.driver.theme", "light");
    localStorage.setItem("nexride.driver.aurora-light-v1", "1");
  }, { session });
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const single = route.request().headers().accept?.includes("object+json");
    const record = name === "profiles"
      ? { id, role: "driver", full_name: "Biloo Driver" }
      : name === "drivers" ? { id, review_status: "approved", is_online: false } : null;
    return route.fulfill({ json: single ? record : record ? [record] : [] });
  });
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { status: "unavailable" } }));
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
}

test("Rider footer matches the approved five items and leaves the map booking sheet uncovered", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem("nexride:preview-enabled", "true"); });
  await page.route("https://tile.openstreetmap.org/**", route =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Rider bottom navigation" });
  await expect(footer).toBeVisible();
  await expect(footer.locator(".biloo-footer-nav__item")).toHaveCount(5);
  for (const name of ["Home", "Activity", "Wallet", "Support", "Account"]) {
    await expect(footer.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(footer.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/rider/trips");
  await expect(footer.getByRole("link", { name: "Wallet" })).toHaveAttribute("href", "/rider/wallet");
  await expect(footer.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
  const sheet = (await page.locator(".nr-rider-flow-panel").boundingBox())!;
  const tabs = (await footer.boundingBox())!;
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(tabs.y + 4);
  await footer.getByRole("button", { name: "Account" }).click();
  await expect(footer.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("Driver footer uses Trips/Earnings and hides during critical live-trip controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDriver(page);
  await page.goto("/driver/earnings");
  const footer = page.getByRole("navigation", { name: "Driver bottom navigation" });
  await expect(footer).toBeVisible();
  await expect(footer.locator(".biloo-footer-nav__item")).toHaveCount(5);
  for (const name of ["Home", "Trips", "Earnings", "Support", "Account"]) {
    await expect(footer.getByText(name, { exact: true })).toBeVisible();
  }
  await expect(footer.getByRole("link", { name: "Trips" })).toHaveAttribute("href", "/driver/activity");
  await expect(footer.getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
  await expect(footer.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support?role=driver");
  await page.goto("/driver/request?offer=44444444-4444-4444-8444-444444444444");
  await expect(page.locator(".nr-driver-app-shell[data-trip-focus=true]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Driver bottom navigation" })).toHaveCount(0);
});

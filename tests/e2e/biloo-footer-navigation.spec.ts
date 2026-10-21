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
  // X-style navigation is icon-only visually; accessible names remain available.
  for (const name of ["Home", "Activity", "Wallet", "Support", "Account"]) {
    await expect(footer.getByRole(name === "Home" || name === "Account" ? "button" : "link", { name, exact: true })).toBeVisible();
  }
  await expect(footer.locator(".biloo-footer-nav__surface")).toHaveCSS("border-radius", "0px");
  await expect(footer.locator(".biloo-footer-nav__surface")).toHaveCSS("box-shadow", "none");
  const navBox = (await footer.boundingBox())!;
  expect(navBox.x).toBe(0);
  expect(navBox.width).toBeCloseTo(390, 0);
  expect(navBox.y + navBox.height).toBeCloseTo(844, 0);
  await expect(footer.locator(".biloo-footer-nav__label").first()).toHaveCSS("width", "1px");
  await expect(footer.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/rider/trips");
  await expect(footer.getByRole("link", { name: "Wallet" })).toHaveAttribute("href", "/rider/wallet");
  await expect(footer.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
  const sheet = (await page.locator(".nr-rider-flow-panel").boundingBox())!;
  const geometry = await page.locator(".nr-rider-flow-panel").evaluate(el => ({
    height: getComputedStyle(el).height,
    minHeight: getComputedStyle(el).minHeight,
    bottom: getComputedStyle(el).bottom,
    ratio: getComputedStyle(el.closest(".rider-map-flow")!).getPropertyValue("--nr-flow-sheet-height"),
    host: el.closest(".rider-map-flow")?.className,
  }));
  expect(sheet.y, JSON.stringify(geometry)).toBeGreaterThanOrEqual(844 * 0.55);
  const tabs = (await footer.boundingBox())!;
  const searchBox = (await page.getByRole("button", { name: "Search destination", exact: true }).boundingBox())!;
  expect(searchBox.y + searchBox.height).toBeLessThanOrEqual(tabs.y - 3);
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(tabs.y);
  // The top of the opaque nav replaces the visible bottom edge of the Rider
  // sheet; the sheet snap height and pointer targets remain unchanged.
  expect(tabs.y).toBeGreaterThan(sheet.y);
  await expect(footer).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".nr-rider-home-sheet")).toBeVisible();
  // The drawer remains full snap-height so touch gestures do not jump when tabs appear.
  await footer.getByRole("button", { name: "Account" }).click();
  await expect(footer.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test("Driver footer provides Activity/Map/Earnings and hides during critical live-trip controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDriver(page);
  await page.goto("/driver/earnings");
  const footer = page.getByRole("navigation", { name: "Driver bottom navigation" });
  await expect(footer).toBeVisible();
  await expect(footer.locator(".biloo-footer-nav__item")).toHaveCount(5);
  for (const name of ["Home", "Activity", "Map", "Earnings", "Account"]) {
    await expect(footer.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(footer.locator(".biloo-footer-nav__surface")).toHaveCSS("border-radius", "0px");
  await expect(footer.locator(".biloo-footer-nav__surface")).toHaveCSS("box-shadow", "none");
  await expect(footer.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/driver/activity");
  await expect(footer.getByRole("link", { name: "Earnings" })).toHaveAttribute("aria-current", "page");
  await expect(footer.getByRole("link", { name: "Map" })).toHaveAttribute("href", "/driver/map");
  await expect(footer.locator(".biloo-footer-nav__label").first()).not.toHaveCSS("width", "1px");
  await page.goto("/driver/request?offer=44444444-4444-4444-8444-444444444444");
  await expect(page.locator(".nr-driver-app-shell[data-trip-focus=true]")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Driver bottom navigation" })).toHaveCount(0);
});

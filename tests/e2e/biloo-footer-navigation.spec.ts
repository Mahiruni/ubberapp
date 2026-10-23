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


test("Rider has no footer tabs; hamburger and Profile remain independent", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem("nexride:preview-enabled", "true"); });
  await page.route("https://tile.openstreetmap.org/**", route =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
  await page.goto("/");
  await expect(page.locator(".biloo-footer-nav, .nr-mobile-nav")).toHaveCount(0);
  const menuTrigger = page.locator(".biloo-home-floating-header .nr-rider-hamburger");
  await expect(menuTrigger).toBeVisible();
  await expect(menuTrigger).toHaveCSS("border-radius", "50%");
  await expect(page.locator(".biloo-home-floating-profile, .nr-rider-profile-top")).toHaveCount(0);
  await expect(page.locator(".nr-rider-home-sheet")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

  await menuTrigger.click();
  const menu = page.locator("#nr-rider-drawer");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".biloo-menu-profile-card")).toHaveCount(1);
  await expect(menu.locator(".nr-rider-drawer-nav>button").first()).toHaveCSS("min-height", "60px");
  await expect(menu.getByRole("button", { name: /My rides/i })).toBeVisible();
  await expect(menu.getByRole("button", { name: /^Wallet/i })).toBeVisible();
  await expect(menu.locator(".nr-menu-section-label").filter({ hasText: "ACCOUNT" })).toHaveCount(0);
  await page.locator(".nr-rider-drawer-close").click();
  await expect(menu).toHaveCount(0);
});

test("Driver pages have no tab footer and retain routes in left hamburger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDriver(page);
  await page.goto("/driver/earnings");
  await expect(page.locator(".biloo-footer-nav, .nr-mobile-nav")).toHaveCount(0);
  const menuTrigger = page.locator(".nr-driver-global-header-left .nr-driver-menu-trigger");
  await expect(menuTrigger).toBeVisible();
  await expect(page.locator(".nr-driver-header-profile")).toHaveCount(0);
  await expect(menuTrigger).toHaveCSS("border-radius", "50%");
  await menuTrigger.click();
  const menu = page.locator("#nr-driver-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator('a[href="/driver/earnings"]')).toBeVisible();
  await expect(menu.locator('a[href="/driver/map"]')).toBeVisible();
  await expect(menu.locator('.biloo-menu-profile-card[href="/driver/profile"]')).toHaveCount(1);
  await expect(menu.locator('.nr-driver-menu-role-switch[href="/rider"]')).toHaveCount(1);
  await expect(menu.locator(".nr-driver-menu-row").first()).toHaveCSS("min-height", "60px");
  const bounds=await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeLessThan(3); // Left-docked, not the legacy right drawer.
  await menu.locator('a[href="/driver/map"]').click();
  await expect(page).toHaveURL(/\/driver\/map$/);
  await expect(page.locator(".biloo-footer-nav")).toHaveCount(0);
  await expect(page.locator(".nr-driver-map-page")).toBeVisible();
});

test("Driver map homepage keeps swipe and separates Profile from hamburger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDriver(page);
  await page.goto("/driver/home");
  await expect(page.locator(".nr-driver-app-shell[data-home=true]")).toBeVisible();
  const menuTrigger = page.locator(".nr-driver-home-menu-host .nr-driver-menu-trigger");
  await expect(menuTrigger).toBeVisible();
  await expect(menuTrigger).toHaveCSS("border-radius", "50%");
  await expect(page.locator(".nr-driver-home-profile")).toHaveCount(0);
  await menuTrigger.click();
  await expect(page.locator("#nr-driver-menu .biloo-menu-profile-card")).toHaveCount(1);
  await page.locator(".nr-driver-menu-close").click();
  await expect(page.locator(".nr-driver-home-swipe[data-map-input-boundary=true]")).toBeVisible();
  const availabilityPanel = page.locator(".nr-driver-home-control-panel");
  await expect(availabilityPanel.locator(".nr-driver-availability-swipe")).toBeVisible();
  await expect(availabilityPanel.locator(".nr-driver-home-quick-actions")).toHaveCount(0);
  await expect(availabilityPanel.getByRole("button", { name: "Activity", exact: true })).toHaveCount(0);
  await expect(availabilityPanel.getByRole("button", { name: "Earnings", exact: true })).toHaveCount(0);
  await expect(availabilityPanel.getByRole("button", { name: "Settings", exact: true })).toHaveCount(0);
  await expect(page.locator(".biloo-footer-nav, .nr-mobile-nav")).toHaveCount(0);
});

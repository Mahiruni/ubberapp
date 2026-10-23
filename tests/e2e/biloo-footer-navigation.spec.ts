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

test("Rider has no footer dock; all four former destinations live in its left drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem("nexride:preview-enabled", "true"); });
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Rider bottom navigation" })).toHaveCount(0);
  await expect(page.locator(".biloo-footer-nav")).toHaveCount(0);
  await page.getByRole("button", { name: "Open menu" }).first().click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Home.*Book a ride/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /My rides.*Trips and receipts/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Wallet & payments/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Account.*Your profile/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Drive with Biloo/ })).toBeVisible();
  const box = (await drawer.boundingBox())!;
  expect(box.x).toBeLessThan(3);
  expect(box.width).toBeGreaterThan(290);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" }).first()).toHaveAttribute("aria-expanded", "false");
});

test("Driver has no bottom dock; its hamburger slides from left with Earnings, Map and Account", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDriver(page);
  await page.goto("/driver/earnings");
  await expect(page.locator(".biloo-footer-nav")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Driver bottom navigation" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open driver menu" }).click();
  const drawer = page.locator("#nr-driver-menu");
  await expect(drawer).toBeVisible();
  const nav = drawer.getByRole("navigation", { name: "Drive navigation" });
  for (const href of ["/driver/home", "/driver/activity", "/driver/map", "/driver/earnings"]) {
    await expect(nav.locator(`a[href="${href}"]`)).toBeVisible();
  }
  await expect(drawer.getByRole("link", { name: /Account.*Profile/ })).toBeVisible();
  await expect(drawer.getByRole("link", { name: /Switch to Rider/ })).toBeVisible();
  const bounds = (await drawer.boundingBox())!;
  expect(bounds.x).toBeLessThan(3);
  await nav.locator('a[href="/driver/map"]').click();
  await expect(page).toHaveURL(/\/driver\/map$/);
  await expect(drawer).toHaveCount(0);
});

test("Driver active-trip navigation still has no bottom dock", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await mockDriver(page);
  await page.goto("/driver/request?offer=44444444-4444-4444-8444-444444444444");
  await expect(page.locator(".nr-driver-app-shell[data-trip-focus=true]")).toBeVisible();
  await expect(page.locator(".biloo-footer-nav")).toHaveCount(0);
});

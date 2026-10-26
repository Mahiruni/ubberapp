import { test, expect } from "@playwright/test";

test.use({ video: "off", serviceWorkers: "block" });

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
  });
  await page.route("https://tile.openstreetmap.org/**", route =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/></svg>' })
  );
});

test("Rider hamburger has one profile destination and direct journey and help links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".nr-rider-home-panel")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();

  // Account and preferences live behind the single profile card.
  await expect(drawer.getByRole("button", { name: "View my profile", exact: true })).toHaveCount(1);
  const journeys = drawer.getByRole("navigation", { name: "Rider navigation" });
  const support = drawer.getByRole("navigation", { name: "Help and safety" });
  await expect(journeys.getByRole("button", { name: /^My rides/i })).toBeVisible();
  await expect(journeys.getByRole("button", { name: /^Wallet/ })).toBeVisible();
  await expect(support.getByRole("button", { name: /^Safety/ })).toBeVisible();
  await expect(support.getByRole("button", { name: /^Help & Support/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /ACCOUNT & PREFERENCES|SAFETY & SUPPORT/i })).toHaveCount(0);
  await expect(drawer.locator(".nr-menu-group-toggle")).toHaveCount(0);

  const rows = drawer.locator(".nr-rider-drawer-nav>button");
  await expect(rows).toHaveCount(6);
  expect(await rows.evaluateAll(elements => elements.every(element =>
    Boolean(element.querySelector(".nr-rider-drawer-icon svg"))
  ))).toBe(true);
  for (const row of await rows.all()) expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(48);

  await support.getByRole("button", { name: /^Help & Support/ }).click();
  await expect(page).toHaveURL(/\/support\?role=rider/);
});

test("Rider hamburger retains focus, escape and 320px layout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(page.locator(".nr-rider-home-panel")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  expect(await drawer.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

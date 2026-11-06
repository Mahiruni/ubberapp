import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
  });
  await page.route("https://tile.openstreetmap.org/**", route =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/></svg>' })
  );
});

test("Rider hamburger exposes current navigation and help links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".nr-rider-home-panel")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();

  // The current menu shows the profile, primary destinations, help, and role switch directly.
  const primary = drawer.getByRole("navigation", { name: "Rider navigation" });
  const support = drawer.getByRole("navigation", { name: "Help and safety" });
  await expect(drawer.locator(".biloo-menu-profile-card")).toHaveCount(1);
  await expect(primary.getByRole("button", { name: /My Rides/i })).toBeVisible();
  await expect(primary.getByRole("button", { name: /^Wallet/i })).toBeVisible();
  await expect(support.getByRole("button", { name: /Safety Center/i })).toBeVisible();
  await expect(support.getByRole("button", { name: /Help & Support/i })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Drive with Biloo/i })).toBeVisible();
  await expect(drawer.locator(".nr-menu-group-toggle")).toHaveCount(0);

  const rows = primary.getByRole("button");
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll(elements => elements.every(element =>
    Boolean(element.querySelector("svg"))
  ))).toBe(true);
  await expect(rows.first()).toHaveCSS("min-height", "60px");

  await support.getByRole("button", { name: /Help & Support/i }).click();
  await expect(page).toHaveURL(/\/support/);
});

test("Rider hamburger retains focus, escape and 320px layout", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(page.locator(".nr-rider-home-panel")).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
  });
  await page.route("https://tile.openstreetmap.org/**", route =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/></svg>' })
  );
});

test("Rider hamburger has non-expandable Account and Help links with consistent icons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".nr-rider-home-panel")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const drawer = page.getByRole("dialog", { name: "Rider menu" });
  await expect(drawer).toBeVisible();

  // All four destinations are visible straight away, without expanding a group.
  const account = drawer.getByRole("navigation", { name: "Account and settings" });
  const support = drawer.getByRole("navigation", { name: "Help and safety" });
  await expect(account.getByRole("button", { name: /^Account/ })).toBeVisible();
  await expect(account.getByRole("button", { name: /^Settings/ })).toBeVisible();
  await expect(support.getByRole("button", { name: /^Safety/ })).toBeVisible();
  await expect(support.getByRole("button", { name: /^Support/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /ACCOUNT & PREFERENCES|SAFETY & SUPPORT/i })).toHaveCount(0);
  await expect(drawer.locator(".nr-menu-group-toggle")).toHaveCount(0);

  const rows = drawer.locator(".nr-rider-drawer-nav>button");
  await expect(rows).toHaveCount(8);
  expect(await rows.evaluateAll(elements => elements.every(element =>
    Boolean(element.querySelector(".nr-rider-drawer-icon svg"))
  ))).toBe(true);
  await expect(account.getByRole("button", { name: /^Account/ })).toHaveCSS("min-height", "57px");

  await support.getByRole("button", { name: /^Support/ }).click();
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

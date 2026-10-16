import { expect, test } from "@playwright/test";

test("Rider dark preference renders black application chrome and white text", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
    localStorage.setItem("nexride.rider.theme", "dark");
  });
  await page.goto("/");
  const app = page.locator(".nr-app[data-theme='dark']");
  await expect(app).toBeVisible();
  await expect(app).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(app).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("Driver welcome and authentication honor their own black/white appearance", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:explicit-signout", "driver");
    localStorage.setItem("nexride.driver.theme", "dark");
  });
  await page.goto("/driver");
  const entry = page.locator(".nr-entry-redesign[data-theme='dark']");
  await expect(entry).toBeVisible();
  await expect(entry).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await expect(entry).toHaveCSS("color", "rgb(255, 255, 255)");
});

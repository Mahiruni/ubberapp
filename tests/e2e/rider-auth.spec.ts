import { expect, test } from "@playwright/test";

test("rider entry exposes clear sign-in and sign-up paths", async ({ page }) => {
  await page.goto("/rider");

  await expect(page.locator('a[href="/rider/sign-up"]')).toBeVisible();
  await expect(page.locator('a[href="/rider/sign-in"]')).toBeVisible();
  await expect(page.getByText("NEXRIDE · RIDER")).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
});

test("rider sign-in, sign-up and recovery are addressable screens", async ({ page }) => {
  await page.goto("/rider/sign-in");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.locator('a[href="/rider/sign-up"]')).toBeVisible();
  await expect(page.locator('a[href="/rider/forgot-password"]')).toBeVisible();

  await page.goto("/rider/sign-up");
  await expect(page.getByLabel("Full name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Phone number", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();

  await page.goto("/rider/forgot-password");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();

  await page.goto("/rider/reset-password");
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
});

test("legacy auth URL remains a rider sign-in compatibility route", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.getByText("NEXRIDE · RIDER")).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
});

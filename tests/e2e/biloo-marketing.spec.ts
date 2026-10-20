import { expect, test } from "@playwright/test";

test.describe("Biloo public marketing", () => {
  test("homepage keeps the Biloo identity and useful rider/driver links", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveTitle(/Biloo/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your city.");
    await expect(page.getByRole("link", { name: /Find your ride/ })).toHaveAttribute("href", "/rider/sign-in");
    await expect(page.getByRole("link", { name: /Drive with Biloo/ }).first()).toHaveAttribute("href", "/driver");
    await expect(page.getByRole("heading", { name: /The city is yours to explore/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Your drive/ })).toBeVisible();
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(hasOverflow).toBe(false);
  });

  test("FAQ gives useful information without a fake app release", async ({ page }) => {
    await page.goto("/explore");
    await page.getByText("Are the Android apps available to download?").click();
    await expect(page.getByText(/Signed Android APKs will be offered/)).toBeVisible();
    await page.goto("/download");
    await expect(page.getByText("Android APK not yet published")).toHaveCount(2);
    await expect(page.getByRole("link", { name: /Open Rider web app/ })).toHaveAttribute("href", "/rider/sign-in");
    await expect(page.getByRole("link", { name: /Open Driver portal/ })).toHaveAttribute("href", "/driver");
  });

  test("marketing information pages share navigation and design", async ({ page }) => {
    await page.goto("/explore/safety");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Moving with confidence");
    await expect(page.getByRole("link", { name: /Explore the Biloo apps/ })).toHaveAttribute("href", "/download");
  });

  test("mobile navigation opens, closes, and routes correctly", async ({ page, isMobile }) => {
    test.skip(!isMobile, "This check covers the mobile drawer.");
    await page.goto("/explore");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
    await page.getByRole("link", { name: "About", exact: true }).last().click();
    await expect(page).toHaveURL(/\/explore\/about$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("A brighter way to move");
  });
});

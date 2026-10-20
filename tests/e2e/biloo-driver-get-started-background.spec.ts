import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // Keep the public welcome view visible; never bypass or mock credentials.
  await page.addInitScript(() => localStorage.setItem("nexride:explicit-signout", "driver"));
});

test("Biloo Driver welcome displays the supplied artwork and functional account links", async ({ page, request }) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/driver");
    const welcome = page.locator(".biloo-driver-welcome");
    const image = welcome.locator(".biloo-driver-welcome__photo");
    await expect(welcome).toBeVisible();
    await expect(image).toHaveAttribute("src", "/brand/biloo-driver-get-started.webp");
    await expect(image).toHaveJSProperty("complete", true);
    await expect(image).toHaveJSProperty("naturalWidth", 864);
    await expect(image).toHaveJSProperty("naturalHeight", 1230);
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect(welcome.getByRole("link", { name: /Get Started/i })).toHaveAttribute("href", "/driver/onboarding");
    await expect(welcome.getByRole("link", { name: "Sign In", exact: true })).toHaveAttribute("href", "/driver/auth");
    await expect(welcome.getByRole("link", { name: "Register", exact: true })).toHaveAttribute("href", "/driver/onboarding");
    for(const name of [/Get Started/i, "Sign In", "Register"]){
      await expect(welcome.getByRole("link", { name })).toBeInViewport();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }

  const asset = await request.get("/brand/biloo-driver-get-started.webp");
  expect(asset.ok()).toBe(true);
  expect(asset.headers()["content-type"]).toMatch(/image\/webp/);
  expect((await asset.body()).length).toBeGreaterThan(80_000);
});

test("Get Started and Sign In open their real Driver pages", async ({ page }) => {
  await page.goto("/driver");
  await page.locator(".biloo-driver-welcome__start").click();
  await expect(page).toHaveURL(/\/driver\/onboarding/);
  await page.goto("/driver");
  await page.locator(".biloo-driver-welcome__signin").click();
  await expect(page).toHaveURL(/\/driver\/auth/);
});

import { test, expect } from "@playwright/test";

test("Biloo Rider Get Started shows the generated welcome artwork with functional auth links", async ({ page, request }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:explicit-signout", "rider");
  });
  for(const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/rider");
    const welcome = page.locator(".biloo-rider-campaign");
    const image = welcome.locator(".biloo-rider-photo");
    await expect(welcome).toBeVisible();
    await expect(image).toBeAttached();
    const computed = await image.evaluate(el => {
      const s = getComputedStyle(el);
      return { backgroundImage: s.backgroundImage, backgroundSize: s.backgroundSize, opacity: s.opacity };
    });
    expect(computed.backgroundImage).toContain("/brand/biloo-rider-get-started.jpg");
    expect(computed.backgroundSize).toBe("100% auto");
    expect(computed.opacity).toBe("1");
    await expect(welcome.locator(".nr-rider-get-started")).toBeInViewport();
    await expect(welcome.locator(".nr-rider-get-started")).toHaveAttribute("href", "/rider/sign-up");
    await expect(welcome.locator(".nr-rider-welcome-sign-in")).toBeInViewport();
    await expect(welcome.locator(".nr-rider-welcome-sign-in")).toHaveAttribute("href", "/rider/sign-in");
    await expect(welcome.locator(".biloo-rider-register")).toBeInViewport();
    await expect(welcome.locator(".biloo-rider-register")).toHaveAttribute("href", "/rider/sign-up");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  const asset = await request.get("/brand/biloo-rider-get-started.jpg");
  expect(asset.ok()).toBe(true);
  expect(asset.headers()["content-type"]).toMatch(/image\/jpeg/);
  expect((await asset.body()).length).toBeGreaterThan(100_000);
});

test("Get Started and Sign In lead to distinct actual auth pages", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nexride:explicit-signout", "rider"));
  await page.goto("/rider");
  await page.locator(".nr-rider-get-started").click();
  await expect(page).toHaveURL(/\/rider\/sign-up/);
  await page.goto("/rider");
  await page.locator(".nr-rider-welcome-sign-in").click();
  await expect(page).toHaveURL(/\/rider\/sign-in/);
});

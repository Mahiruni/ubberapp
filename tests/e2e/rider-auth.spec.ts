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
  await page.getByLabel("Full name", { exact: true }).fill("NexRide Rider");
  await page.getByLabel("Phone number", { exact: true }).fill("+251912345678");
  await page.getByLabel("Email address", { exact: true }).fill("rider@example.test");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();

  await page.goto("/rider/forgot-password");
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();

  await page.goto("/rider/reset-password");
  await expect(page.getByLabel("Confirm password", { exact: true })).toBeVisible();
});

test("legacy auth URL redirects one-way to Rider sign-in", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveURL(/\/rider\/sign-in$/);
  await expect(page.getByText("NEXRIDE · RIDER")).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
});

test("logout never restores a saved Rider session automatically", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:explicit-signout", "rider");
    localStorage.setItem("nexride:onboarding-complete", "true");
    localStorage.removeItem("nexride:preview-enabled");
  });
  // Follow the same landing path used by the Rider Log out action.
  await page.goto("/rider/sign-in?logged_out=1");
  const password = page.getByLabel("Password", { exact: true });
  await expect(password).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem("nexride:explicit-signout")))
    .toBe("rider");
  await page.goto("/");
  await expect(page).toHaveURL(/\/rider\/sign-in$/);
  await page.reload();
  await expect(password).toBeVisible({ timeout: 15000 });
});

test("Rider destination search opens with Pickup focused and the planning placeholder", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:explicit-signout", "rider");
    localStorage.setItem("nexride:preview-enabled", "true");
    localStorage.setItem("nexride:onboarding-complete", "true");
  });
  await page.goto("/");
  const planner = page.getByRole("button", { name: "Search destination", exact: true });
  await expect(planner).toContainText("Search destination");
  await planner.click();
  const pickup = page.locator(".nr-endpoint-fields input").first();
  const destination = page.locator(".nr-endpoint-fields input").last();
  await expect(pickup).toBeFocused();
  await expect(pickup).toHaveAttribute("placeholder", "Plan your ride");
  await expect(destination).not.toBeFocused();
});

test("Rider and Driver welcome homepages have no city photographs", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nexride:explicit-signout", "rider"));
  for (const [route, destination] of [
    ["/rider", "/rider/sign-up"],
    ["/driver", "/driver/onboarding"],
  ]) {
    await page.goto(route);
    await expect(page.locator(".nr-entry-hero")).toBeAttached();
    await expect(page.locator(".nr-entry-city, .nr-welcome-art")).toHaveCount(0);
    await expect(page.locator('img[src*="addis-nexride-auth"], img[src*="addis-skyline"]')).toHaveCount(0);
    await expect(page.locator(`a[href="${destination}"]`)).toBeVisible();
  }
});

test("Rider map home contains no city-photo promotion card", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
    localStorage.setItem("nexride:onboarding-complete", "true");
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Search destination", exact: true })).toBeVisible();
  await expect(page.locator(".nr-map-city")).toHaveCount(0);
  await expect(page.locator('img[src*="addis-skyline"]')).toHaveCount(0);
});

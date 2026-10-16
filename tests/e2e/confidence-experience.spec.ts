import { expect, test } from "@playwright/test";
test.use({ video: "off" });

test("brand experience offers real Rider and Driver routes and switches language", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your city. Your pace. Your NexRide.");
  await expect(page.getByRole("link", { name: "Book a ride", exact: true }).first()).toHaveAttribute("href", "/rider");
  await expect(page.getByRole("link", { name: "Become a driver", exact: true }).first()).toHaveAttribute("href", "/driver");
  await page.getByRole("button", { name: "Language" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ከተማዎ");
  await expect(page.getByRole("link", { name: "ጉዞ ይያዙ", exact: true }).first()).toHaveAttribute("href", "/rider");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
});

test("service guide explains real capabilities without enrolling users into unfunded benefits", async ({ page }) => {
  await page.goto("/standard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Confidence in every journey.");
  await expect(page.getByText("NexRide Circle and referral rewards are not available yet.", { exact: false })).toBeVisible();
  await expect(page.getByText("In-app support is not an emergency dispatch service.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Support", exact: true })).toHaveAttribute("href", "/support?role=rider");
});

test("quality baseline labels samples and does not retain old metrics after an error", async ({ page }) => {
  let failed = false;
  await page.route("**/api/admin/service-quality?**", route => failed
    ? route.fulfill({ status: 503, json: { status: "unavailable" } })
    : route.fulfill({ json: { status: "ready", from: "2026-10-09T08:00:00Z", to: "2026-10-16T08:00:00Z", totalRequests: 1600, sampled: true,
      metrics: { observedRequests: 1000, completed: 800, cancelled: 100, withdrawn: 50, riderCancellations: 70, driverCancellations: 20, unattributedCancellations: 10, closedCompletionPercent: 84.2, meanMatchSeconds: 60, matchedSamples: 900, repeatCompletedRiders: 12, completedRiders: 500 } } }));
  await page.goto("/admin/quality");
  await expect(page.getByText("84.2%", { exact: true })).toBeVisible();
  await expect(page.getByText("Partial baseline:", { exact: false })).toBeVisible();
  failed = true;
  await page.getByRole("button", { name: "Refresh data" }).click();
  await expect(page.locator(".nr-quality-error")).toContainText("Service data is unavailable");
  await expect(page.getByText("84.2%", { exact: true })).toHaveCount(0);
});

test("small-screen brand and service pages fit in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const route of ["/explore", "/standard", "/admin/quality"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
});

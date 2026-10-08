import { test, expect, type Page } from "@playwright/test";
import type { FareSet } from "../../lib/nexride-booking";
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/><path d="M0 140 256 80M90 0 160 256" stroke="white" stroke-width="15"/></svg>`;
function quote(): FareSet {
  return {
    source: "service",
    revision: "revision-1",
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    chargesComplete: true,
    offers: (["economy", "comfort", "xl"] as const).map((category, i) => ({
      id: `quote-${category}`,
      category,
      seats: i === 2 ? 6 : 4,
      availability: "available",
      pickupMinutes: 4 + i,
      amount: [145, 195, 250][i],
      currency: "ETB",
      priceType: i === 1 ? "confirmed" : "estimate",
      charges: [{ name: "Service fee", amount: 35 }],
    })),
  };
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: tile }),
  );
  await page.route("**/api/rider/route", (r) => {
    const { pickup, destination } = r.request().postDataJSON();
    return r.fulfill({
      json: {
        status: "ready",
        coverage: { kind: "preview" },
        route: {
          provider: "mapbox",
          durationSeconds: 720,
          distanceMeters: 4300,
          geometry: [
            [pickup.lat, pickup.lng],
            [destination.lat, destination.lng],
          ],
        },
      },
    });
  });
});
async function openRides(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: /Bole International Airport/ })
    .click();
  await page.getByLabel("Pickup location", { exact: true }).fill("Bole Atlas");
  await page.locator(".nr-place-suggestion").first().click();
  await page
    .getByRole("button", { name: "Continue to ride options", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a ride" }),
  ).toBeVisible();
}
test("three illustrated sample rides keep prices aligned and real booking unavailable", async ({
  page,
}) => {
  await openRides(page);
  await expect(page.locator(".nr-ride-card")).toHaveCount(3);
  await expect(page.locator(".nr-vehicle-art")).toHaveCount(3);
  for (const category of ["Economy", "Comfort", "XL"])
    await expect(
      page.getByRole("radio", { name: new RegExp(category) }),
    ).toContainText("Pickup estimate unavailable");
  await expect(
    page.getByRole("button", { name: "Request Ride", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".nr-ride-selection")).toContainText(
    "Sample calculation, not a live quote",
  );
  await expect(page.locator(".nr-provider-route")).toHaveCount(1);
  await expect(page.locator(".nr-map-ride-label")).toContainText("Bole");
  const prices = await page
    .locator(".nr-ride-price")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().right));
  expect(Math.max(...prices) - Math.min(...prices)).toBeLessThan(1);
  await page.getByRole("radio", { name: /XL/ }).click();
  await expect(page.getByRole("radio", { name: /XL/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page
    .getByRole("button", { name: "Edit payment method", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "No payment will be processed",
  );
  await expect(
    page.getByRole("dialog").getByRole("radio", { name: /Card/ }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("temporary fare-service error automatically retries and recovers", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/rider/fares", async (r) => {
    attempts++;
    if (attempts === 1) {
      await r.fulfill({ status: 503, json: { status: "temporarily_unavailable" } });
    } else await r.fulfill({ json: quote() });
  });
  await openRides(page);
  await expect(page.getByRole("radio", { name: /Economy/ })).toBeVisible();
  await expect(page.locator(".nr-ride-selection footer .nr-button")).toBeEnabled();
  expect(attempts).toBe(2);
});
test("persistent fare outage shows safe samples but prevents real booking", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/rider/fares", async (r) => {
    attempts++;
    await r.fulfill({ status: 503, json: { status: "temporarily_unavailable" } });
  });
  await openRides(page);
  await expect(page.getByRole("radio", { name: /Economy/ })).toBeVisible();
  await expect(page.locator(".nr-ride-selection")).toContainText(
    "Sample calculation, not a live quote",
  );
  await expect(page.locator(".nr-ride-selection footer .nr-button")).toBeDisabled();
  expect(attempts).toBe(3);
});
test("unavailable categories cannot be selected and all charges appear before request", async ({
  page,
}) => {
  const set = quote();
  set.offers[0].availability = "unavailable";
  set.offers[0].amount = null;
  set.offers[0].pickupMinutes = null;
  await page.route("**/api/rider/fares", (r) => r.fulfill({ json: set }));
  await openRides(page);
  await expect(page.getByRole("radio", { name: /Economy/ })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Request Ride", exact: true }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /Comfort/ }).click();
  await expect(page.locator(".nr-fare-explanation")).toContainText(
    "Confirmed quote",
  );
  await expect(page.locator(".nr-fare-breakdown")).toContainText("Service fee");
  await expect(page.locator(".nr-fare-breakdown .total")).toContainText(
    "ETB 230",
  );
  await expect(
    page.getByRole("button", { name: "Request Ride", exact: true }),
  ).toBeEnabled();
});
test("changed pricing requires explicit review before a second attempt", async ({
  page,
}) => {
  await page.route("**/api/rider/fares", (r) => r.fulfill({ json: quote() }));
  let calls = 0;
  await page.route("**/api/rider/requests", (r) => {
    calls++;
    const updated = quote();
    updated.revision = "revision-2";
    updated.offers[0].amount = 185;
    return calls === 1
      ? r.fulfill({
          status: 409,
          json: { status: "price_changed", fares: updated },
        })
      : r.fulfill({ status: 503, json: { status: "failed" } });
  });
  await openRides(page);
  await page.getByRole("button", { name: "Request Ride", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm ride request", exact: true })
    .click();
  await expect(page.locator(".nr-fare-state")).toContainText(
    "The price has changed",
  );
  await expect(page.locator(".nr-fare-state")).toContainText("ETB 180");
  await expect(page.locator(".nr-fare-state")).toContainText("ETB 220");
  await expect(
    page.getByRole("button", { name: "Request Ride", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(1);
  await page
    .getByRole("button", { name: "Accept updated price", exact: true })
    .click();
  await page.getByRole("button", { name: "Request Ride", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm ride request", exact: true })
    .click();
  await expect(page.locator(".nr-fare-state")).toContainText(
    "Ride request couldn’t be completed",
  );
  expect(calls).toBe(2);
});
test("pending double taps are deduplicated and retries preserve their idempotency key", async ({
  page,
}) => {
  await page.route("**/api/rider/fares", (r) => r.fulfill({ json: quote() }));
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const keys: string[] = [];
  await page.route("**/api/rider/requests", async (r) => {
    keys.push(r.request().headers()["idempotency-key"]);
    if (keys.length === 1) await gate;
    await r.fulfill({ status: 503, json: { status: "failed" } });
  });
  await openRides(page);
  await page.getByRole("button", { name: "Request Ride", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm ride request", exact: true })
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
  await expect(
    page.getByRole("button", { name: "Request Ride", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Edit payment method", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".nr-rider-map-surface")).toHaveAttribute(
    "inert",
    "",
  );
  expect(keys).toHaveLength(1);
  release();
  await expect(page.locator(".nr-fare-state")).toContainText(
    "Ride request couldn’t be completed",
  );
  await page.getByRole("button", { name: "Request Ride", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm ride request", exact: true })
    .click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
});
test("disconnected request endpoint returns a recoverable failure without fake matching", async ({
  page,
}) => {
  await page.route("**/api/rider/fares", (r) => r.fulfill({ json: quote() }));
  await openRides(page);
  await page.getByRole("button", { name: "Request Ride", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm ride request", exact: true })
    .click();
  await expect(page.locator(".nr-fare-state")).toContainText(
    "Booking is not connected",
  );
  await expect(
    page.getByRole("heading", { name: "Finding your driver…" }),
  ).toHaveCount(0);
});
test("short mobile and desktop workspaces keep map, sheet and footer separate", async ({
  page,
}) => {
  await openRides(page);
  for (const size of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 740, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = document
              .querySelector(".nr-rider-map-surface")!
              .getBoundingClientRect(),
            panel = document
              .querySelector(".nr-panel")!
              .getBoundingClientRect(),
            button = document
              .querySelector(".nr-ride-selection footer .nr-button")!
              .getBoundingClientRect();
          return (
            (innerWidth <= 800 && !(innerWidth >= 600 && innerHeight <= 600)
              ? map.bottom <= panel.top + 1
              : map.right <= panel.left + 1) &&
            button.bottom <= innerHeight &&
            document.documentElement.scrollWidth <= innerWidth
          );
        }),
      )
      .toBe(true);
  }
});

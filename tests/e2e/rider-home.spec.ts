import { test, expect, type Page } from "@playwright/test";
// Deterministic tile fixtures keep QA independent of a public map service.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/><path d="M0 140 256 80M90 0 160 256" stroke="white" stroke-width="15"/><rect x="15" y="15" width="50" height="45" rx="5" fill="#d4e8dc"/></svg>`;
async function mockTiles(page: Page) {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: tile }),
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
  await mockTiles(page);
});
test("home exposes empty history, labeled examples and the requested navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("No recent destinations yet.", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator(".nr-rider-home-panel")
      .getByRole("button", { name: "Search destination", exact: true }),
  ).toContainText("Where to?");
  for (const label of ["Home", "Activity", "Safety center", "Messages", "Account"])
    await expect(
      page
        .locator(".nr-navigation:visible")
        .getByRole("button", { name: label, exact: true }),
    ).toBeVisible();
  await expect(page.locator(".nr-user-location-dot")).toHaveCount(0);
  await expect(page.locator(".map-position")).toHaveCount(0);
});
test("a real browser fix creates the blue dot and accuracy circle, and recenter moves the map", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 9.008,
    longitude: 38.775,
    accuracy: 25,
  });
  await context.grantPermissions(["geolocation"]);
  await page.goto("/");
  await expect(page.locator(".nr-user-location-dot")).toHaveCount(1);
  await expect(page.locator(".nr-location-accuracy")).toHaveCount(1);
  await expect(page.locator(".nr-home-location")).toContainText("±25 m");
  const map = page.locator(".nr-geographic-map");
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 90,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.getByRole("button", { name: "Recenter on my location" }).click();
  await expect
    .poll(async () => {
      const dot = await page.locator(".nr-user-location-dot").boundingBox();
      return dot
        ? Math.abs(dot.x + dot.width / 2 - box.x - box.width / 2) < 4 &&
            Math.abs(dot.y + dot.height / 2 - box.y - box.height / 2) < 4
        : false;
    })
    .toBe(true);
});
test("permission denial keeps destination search usable without a fake location marker", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _ok: unknown,
          error: (e: { code: number }) => void,
        ) => error({ code: 1 }),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Recenter on my location" }).click();
  await expect(page.locator(".nr-home-location")).toContainText(
    "Location permission is off",
  );
  await expect(page.locator(".nr-user-location-dot")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search destination" }),
  ).toBeVisible();
});
test("loading and unavailable location states remain recoverable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          _ok: unknown,
          error: (e: { code: number }) => void,
        ) => setTimeout(() => error({ code: 2 }), 500),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Recenter on my location" }).click();
  await expect(page.locator(".nr-home-location")).toContainText(
    "Finding your location",
  );
  await expect(
    page.getByRole("button", { name: "Recenter on my location" }),
  ).toBeDisabled();
  await expect(page.locator(".nr-home-location")).toContainText(
    "We couldn’t find your location",
  );
  await expect(
    page.getByRole("button", { name: "Recenter on my location" }),
  ).toBeEnabled();
});
test("Home and Work shortcuts are explicitly selected and restored, with preview recents", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.locator(".nr-rider-home-panel");
  await panel.getByRole("button", { name: "Home", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Set your Home shortcut" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Meskel Square/ }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByLabel("Pickup location", { exact: true }).fill("Bole Atlas");
  await page
    .locator(".nr-place-suggestion")
    .filter({ hasText: "Bole Atlas" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Preview ride options", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a ride" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(panel.getByText("Meskel Square", { exact: true })).toBeVisible();
  await page.reload();
  await expect(panel.getByText("Meskel Square", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(
    page.getByText("Shortcuts are saved on this device.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Work Choose a preview destination/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Set your Work shortcut" }),
  ).toBeVisible();
});
test("a failed map does not block destination search", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByText("Map unavailable.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search destination" }),
  ).toBeVisible();
});
test("small, landscape and desktop layouts keep map controls, sheet and navigation separate", async ({
  page,
}) => {
  await page.goto("/");
  for (const viewport of [
    { width: 360, height: 780 },
    { width: 390, height: 844 },
    { width: 740, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    const map = (await page.locator(".nr-rider-map-surface").boundingBox())!;
    const panel = (await page.locator(".nr-panel").boundingBox())!;
    const control = (await page.locator(".nr-recenter").boundingBox())!;
    expect(control.x).toBeGreaterThanOrEqual(map.x);
    expect(control.y).toBeGreaterThanOrEqual(map.y);
    expect(control.x + control.width).toBeLessThanOrEqual(map.x + map.width);
    expect(control.y + control.height).toBeLessThanOrEqual(map.y + map.height);
    if (viewport.width <= 800) {
      const nav = (await page.locator(".nr-mobile-nav").boundingBox())!;
      expect(map.y + map.height).toBeLessThanOrEqual(panel.y + 1);
      expect(panel.y + panel.height).toBeLessThanOrEqual(nav.y + 1);
    } else expect(map.x + map.width).toBeLessThanOrEqual(panel.x + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

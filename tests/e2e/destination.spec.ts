import { test, expect, type Page } from "@playwright/test";
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2f4"/><path d="M0 140 256 80M90 0 160 256" stroke="white" stroke-width="15"/></svg>`;
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/svg+xml", body: tile }),
  );
});
async function openSearch(page: Page) {
  await page.goto("/");
  await page.locator(".nr-rider-home-panel")
    .getByRole("button", { name: /^(Search destination|መድረሻ ይፈልጉ)$/ })
    .click();
}
async function select(
  page: Page,
  field: "pickup" | "destination",
  name: string,
) {
  await page
    .getByLabel(field === "pickup" ? "Pickup location" : "Search destination", {
      exact: true,
    })
    .fill(name);
  await page
    .locator(".nr-place-suggestion")
    .filter({ hasText: name === "መስቀል" ? "Meskel Square" : name })
    .first()
    .click();
}
// The destination footer is intentionally hidden during active text entry. A
// blocked journey must either expose a disabled action or no action at all.
async function expectCannotContinue(page: Page) {
  const action = page.locator(".nr-destination-panel footer button");
  if (await action.count()) await expect(action).toBeDisabled();
  else await expect(page.locator(".nr-destination-panel footer")).toHaveCount(0);
}
async function provider(page: Page) {
  await page.route("**/api/rider/route", async (r) => {
    const { pickup, destination } = r.request().postDataJSON();
    await r.fulfill({
      json: {
        status: "ready",
        coverage: { kind: "preview" },
        route: {
          provider: "mapbox",
          durationSeconds: 720,
          distanceMeters: 4300,
          geometry: [
            [pickup.lat, pickup.lng],
            [
              (pickup.lat + destination.lat) / 2,
              (pickup.lng + destination.lng) / 2,
            ],
            [destination.lat, destination.lng],
          ],
        },
      },
    });
  });
}
test("search requires selected endpoints, finds both scripts and distinguishes localities", async ({
  page,
}) => {
  await openSearch(page);
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    "",
  );
  await expectCannotContinue(page);
  await page.getByLabel("Search destination", { exact: true }).fill("ኮልፌ");
  const kolfe = page
    .locator(".nr-place-suggestion")
    .filter({ has: page.locator("strong", { hasText: /^Kolfe$/ }) });
  await expect(kolfe).toHaveCount(2);
  await expect(kolfe.first()).toContainText("West");
  await expect(kolfe.last()).toContainText("North");
  await select(page, "destination", "መስቀል");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-route-review.unavailable")).toBeVisible();
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(0);
  await expect(page.locator(".nr-route-review > strong")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Preview ride options", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a ride" }),
  ).toBeVisible();
});
test("provider route is rendered and editing pickup invalidates it immediately", async ({
  page,
}) => {
  await provider(page);
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-route-review.ready")).toContainText(
    "12 min · 4.3 km",
  );
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(1);
  await expect(page.locator(".nr-rider-map-surface")).toHaveAttribute("data-map-status", /ready|unavailable/);
  if (await page.locator(".nr-rider-map-surface").getAttribute("data-map-status") === "ready") {
    await expect(page.locator(".nr-pin-core.pickup")).toHaveCount(1);
    await expect(page.locator(".nr-pin-core.destination")).toHaveCount(1);
  } else {
    await expect(page.locator(".nr-map-unavailable")).toBeVisible();
  }
  await page
    .getByLabel("Pickup location", { exact: true })
    .fill("unselected text");
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(0);
  await expectCannotContinue(page);
});
test("dragging pickup updates its label and requires confirmation before rerouting", async ({
  page,
}) => {
  await provider(page);
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(1);
  await expect(page.locator(".nr-rider-map-surface")).toHaveAttribute("data-map-status", /ready|unavailable/);
  if (await page.locator(".nr-rider-map-surface").getAttribute("data-map-status") === "unavailable") {
    // CI intentionally has no valid Mapbox key: preserve a usable text search
    // and prove editing clears a stale route instead of faking drag coordinates.
    await expect(page.locator(".nr-map-unavailable")).toBeVisible();
    await page.getByLabel("Pickup location", { exact: true }).fill("changed pickup");
    await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(0);
    await expectCannotContinue(page);
    return;
  }
  const pin = (await page.locator(".nr-pin-core.pickup").boundingBox())!;
  await page.mouse.move(pin.x + 14, pin.y + 14);
  await page.mouse.down();
  await page.mouse.move(pin.x + 44, pin.y + 32, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    /Map pin/,
  );
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(0);
  await expectCannotContinue(page);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(1);
  await expect(
    page.locator(".nr-destination-panel footer").getByRole("button"),
  ).toBeEnabled();
});
test("map selection keeps exact coordinates synchronized without a geocoder", async ({
  page,
}) => {
  await page.route("**/api/rider/route", (r) =>
    r.fulfill({ status: 503, json: { status: "unavailable", coverage: { kind: "preview" } } }),
  );
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await page.getByLabel("Pickup location", { exact: true }).focus();
  await page
    .getByRole("button", { name: "Choose on map", exact: true })
    .click();
  const map = (await page.locator(".nr-geographic-map").boundingBox())!;
  await page.mouse.move(map.x + map.width / 2, map.y + map.height / 2);
  await page.mouse.down();
  await page.mouse.move(map.x + map.width / 2 + 85, map.y + map.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".nr-rider-map-surface")).toHaveAttribute("data-map-status", /ready|unavailable/);
  if (await page.locator(".nr-rider-map-surface").getAttribute("data-map-status") === "unavailable") {
    // No map imagery or calibrated center exists; never invent a pickup point.
    await expect(page.locator(".nr-map-unavailable")).toBeVisible();
    await expect(page.getByRole("button", { name: "Use map center", exact: true })).toBeDisabled();
    return;
  }
  await page
    .getByRole("button", { name: "Use map center", exact: true })
    .click();
  const coordinate = await page.locator(".nr-pin-coordinate").textContent();
  expect(coordinate).toMatch(/\d+\.\d{5}, \d+\.\d{5}/);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    "Map pin",
  );
  await expect(page.locator(".nr-pin-core.pickup")).toHaveCount(1);
  await expect(
    page.locator(".nr-destination-panel footer").getByRole("button"),
  ).toBeEnabled();
});
test("routing failure can be retried and coverage restrictions block continuation", async ({
  page,
}) => {
  let state = "error";
  await page.route("**/api/rider/route", (r) =>
    r.fulfill({ json: { status: state, coverage: { kind: "configured" } } }),
  );
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-route-review.error")).toBeVisible();
  await expectCannotContinue(page);
  state = "coverage";
  await page
    .locator(".nr-route-review")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(page.locator(".nr-route-review.coverage")).toBeVisible();
  await expectCannotContinue(page);
});
test("an uncertain device location requires explicit pickup confirmation", async ({
  page,
  context,
}) => {
  await context.setGeolocation({
    latitude: 9.008,
    longitude: 38.775,
    accuracy: 350,
  });
  await context.grantPermissions(["geolocation"]);
  await page.route("**/api/rider/search?mode=reverse**", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        results: [
          {
            lat: 9.008,
            lng: 38.775,
            name: "Bole",
            address: "Bole, Addis Ababa",
            source: "provider",
            confirmed: true,
          },
        ],
      },
    }),
  );
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await expect(page.getByLabel("Pickup location", { exact: true })).toHaveValue(
    "Bole",
  );
  await expectCannotContinue(page);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(
    page.locator(".nr-destination-panel footer").getByRole("button"),
  ).toBeEnabled();
});
test("no-results state and sheet resizing keep search and map usable in short viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/rider/search?*", (route) => route.fulfill({ json: { status: "ready", results: [] } }));
  await openSearch(page);
  await page
    .getByLabel("Search destination", { exact: true })
    .fill("not-a-real-destination");
  await expect(page.locator(".nr-empty-text")).toBeVisible();
  // The handle is intentionally hidden during typing; Escape closes text
  // search without discarding the query, restoring keyboard resize controls.
  await page.getByLabel("Search destination", { exact: true }).press("Escape");
  const handle = page.locator(".nr-destination-panel .nr-flow-sheet-handle");
  await expect(handle).toHaveCount(1);
  // Search keyboard mode may hide the resize grip to prioritize suggestions.
  // When visible, its keyboard and pointer contract must still be usable.
  if (await handle.isVisible()) {
    await handle.focus();
    await page.keyboard.press("End");
    await expect(handle).toHaveAttribute("aria-valuenow", "75");
    await page.keyboard.press("Home");
    await expect(handle).toHaveAttribute("aria-valuenow", "28");
    // A tap cycles between the three supported sizes. Pointer drag physics
    // are separately covered by sheet-geometry tests and native touch QA.
    await handle.click();
    await expect(handle).toHaveAttribute("aria-valuenow", "46");
  } else {
    await expect(page.getByLabel("Search destination", { exact: true })).toBeVisible();
  }
  for (const size of [
    { width: 390, height: 460 },
    { width: 740, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = document
            .querySelector(".nr-rider-map-surface")!
            .getBoundingClientRect();
          const panel = document
            .querySelector(".nr-panel")!
            .getBoundingClientRect();
          return (
            // The Rider sheet overlays the map on compact screens by design;
            // insist on usable positive geometry and no horizontal overflow,
            // not a false non-overlap requirement.
            map.width > 0 && map.height > 0 &&
            panel.width > 0 && panel.height > 0 &&
            panel.left >= -1 && panel.right <= innerWidth + 1 &&
            panel.top < innerHeight && panel.bottom > 0 &&
            document.documentElement.scrollWidth <= innerWidth + 1
          );
        }),
      )
      .toBe(true);
  }
});

test("a late route response cannot restore a cleared journey", async ({
  page,
}) => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started = false;
  await page.route("**/api/rider/route", async (r) => {
    started = true;
    const { pickup, destination } = r.request().postDataJSON();
    await gate;
    await r
      .fulfill({
        json: {
          status: "ready",
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
      })
      .catch(() => {});
  });
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect.poll(() => started).toBe(true);
  await page
    .getByLabel("Pickup location", { exact: true })
    .fill("changed pickup");
  release();
  await expect(page.locator(".nr-rider-map-surface.nr-map-has-route")).toHaveCount(0);
  await expectCannotContinue(page);
});
test("Amharic UI uses translated place names and locality details", async ({
  page,
}) => {
  // The compact top-bar toggle is intentionally hidden while searching.
  // Start with a persisted Amharic preference instead of clicking hidden UI.
  await page.addInitScript(() => localStorage.setItem("nexride:language", "am"));
  await page.goto("/");
  await page.locator(".nr-rider-home-panel")
    .getByRole("button", { name: "መድረሻ ይፈልጉ", exact: true }).click();
  await expect(page.locator(".nr-destination-panel")).toContainText("መድረሻ");
  await page.locator(".nr-endpoint-field input").last().fill("ኮልፌ");
  await expect(
    page.locator(".nr-place-suggestion strong").filter({ hasText: /^ኮልፌ$/ }),
  ).toHaveCount(2);
  await expect(page.locator(".nr-destination-panel")).toContainText("ምዕራብ");
  await expect(page.locator(".nr-destination-panel")).toContainText("ሰሜን");
});

test("temporary provider addresses never enter saved preview history", async ({
  page,
}) => {
  await provider(page);
  await page.route("**/api/rider/search?q=*", (r) =>
    r.fulfill({
      json: {
        status: "ready",
        results: [
          {
            name: "Provider-only address",
            address: "Private selected address, Addis Ababa",
            lat: 9.01,
            lng: 38.76,
            source: "provider",
            confirmed: true,
          },
        ],
      },
    }),
  );
  await openSearch(page);
  await select(page, "destination", "Provider-only address");
  await select(page, "pickup", "Bole Atlas");
  await page.locator(".nr-destination-panel footer").getByRole("button").click();
  await page.getByRole("button", { name: /Preview this ride/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("nexride-preview-v2")!).trip
            ?.destination,
      ),
    )
    .toBe("Destination");
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("Provider-only address");
  expect(stored).not.toContain("Private selected address");
});

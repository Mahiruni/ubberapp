import { mapFixture, readyMap, routePixelCount } from "./helpers/mobility";
import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await mapFixture(page);
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
});
async function openSearch(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
}
async function select(
  page: Page,
  field: "pickup" | "destination",
  name: string,
) {
  await page
    .getByLabel(field === "pickup" ? "Pickup" : "Search destination", {
      exact: true,
    })
    .fill(name);
  await page
    .locator(".nr-place-suggestion")
    .filter({ hasText: name === "መስቀል" ? "Meskel Square" : name })
    .first()
    .click();
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
  await expect(page.getByLabel("Pickup", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
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
  await expect(page.locator(".nr-map-has-route")).toHaveCount(0);
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
  await readyMap(page);
  const idlePixels = await routePixelCount(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-route-review.ready")).toContainText(
    "12 min · 4.3 km",
  );
  await expect(page.locator(".nr-map-has-route")).toHaveCount(1);
  await expect(page.locator(".nr-map-endpoint-marker:has(.pickup)")).toHaveCount(1);
  await expect(page.locator(".nr-map-endpoint-marker:has(.destination)")).toHaveCount(1);
  await expect.poll(()=>routePixelCount(page)).toBeGreaterThan(idlePixels + 100);
  await page
    .getByLabel("Pickup", { exact: true })
    .fill("unselected text");
  await expect(page.locator(".nr-map-has-route")).toHaveCount(0);
  await expect.poll(()=>routePixelCount(page)).toBeLessThanOrEqual(idlePixels + 50);
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
});
test("dragging pickup updates its label and requires confirmation before rerouting", async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await provider(page);
  await openSearch(page);
  await select(page, "destination", "Meskel Square");
  await select(page, "pickup", "Bole Atlas");
  await expect(page.locator(".nr-map-has-route")).toHaveCount(1);
  const marker=page.locator(".nr-map-endpoint-marker:has(.pickup)");
  await expect(marker).toBeInViewport();
  await expect.poll(()=>marker.evaluate(element=>{const b=element.getBoundingClientRect();return element.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true);
  const pin=(await marker.boundingBox())!;
  const x=pin.x+pin.width/2, y=pin.y+pin.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x-45,y-35,{steps:12});
  await page.mouse.up();
  await expect(page.getByLabel("Pickup", { exact: true })).toHaveValue(
    /Map pin/,
  );
  await expect(page.locator(".nr-map-has-route")).toHaveCount(0);
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(page.locator(".nr-map-has-route")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Choose a ride", exact: true }),
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
  await page.getByLabel("Pickup", { exact: true }).focus();
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
  await page
    .getByRole("button", { name: "Use map center", exact: true })
    .click();
  const coordinate = await page.locator(".nr-pin-coordinate").textContent();
  expect(coordinate).toMatch(/\d+\.\d{5}, \d+\.\d{5}/);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(page.getByLabel("Pickup", { exact: true })).toHaveValue(
    "Map pin",
  );
  await expect(page.locator(".nr-map-endpoint-marker:has(.pickup)")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Preview ride options", exact: true }),
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
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
  state = "coverage";
  await page
    .locator(".nr-route-review")
    .getByRole("button", { name: "Try again", exact: true })
    .click();
  await expect(page.locator(".nr-route-review.coverage")).toBeVisible();
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
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
  await expect(page.getByLabel("Pickup", { exact: true })).toHaveValue(
    "Bole",
  );
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Confirm pickup pin", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview ride options", exact: true }),
  ).toBeEnabled();
});
test("no-results state and sheet resizing keep search and map usable in short viewports", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSearch(page);
  await page
    .getByLabel("Search destination", { exact: true })
    .fill("not-a-real-destination");
  await expect(page.locator(".nr-empty-text")).toBeVisible();
  await expect(page.locator(".rider-search-view")).toHaveAttribute("data-search-open","true");
  await expect(page.locator(".nr-flow-sheet-handle")).toBeHidden();
  for (const size of [{width:390,height:460},{width:740,height:390},{width:1440,height:900}]) {
    await page.setViewportSize(size);
    await expect(page.getByLabel("Search destination",{exact:true})).toBeInViewport();
    await expect(page.locator(".nr-destination-body")).toHaveCSS("overflow-y","auto");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const handle=page.getByRole("slider",{name:"Resize search panel",exact:true});
  await handle.press("End");
  await expect(handle).toHaveAttribute("aria-valuenow","75");
  await handle.press("Home");
  await expect(handle).toHaveAttribute("aria-valuenow","28");

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
    .getByLabel("Pickup", { exact: true })
    .fill("changed pickup");
  release();
  await expect(page.locator(".nr-map-has-route")).toHaveCount(0);
  await expect(page.locator(".nr-destination-panel footer button:not([disabled])")).toHaveCount(0);
});
test("Amharic UI uses translated place names and locality details", async ({
  page,
}) => {
  await page.goto("/");
  if (page.viewportSize()!.width <= 800) await page.getByRole("button",{name:"Open menu",exact:true}).click();
  await page.getByRole("button", {name:"አማርኛ",exact:true}).last().click();
  if (page.viewportSize()!.width <= 800) await page.keyboard.press("Escape");
  await page.locator(".nr-rider-home-panel").getByRole("button",{name:"መድረሻ ይፈልጉ",exact:true}).click();
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
  await page
    .getByRole("button", { name: "Choose a ride", exact: true })
    .click();
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

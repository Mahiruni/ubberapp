import { mapFixture, readyMap, reachableControl } from "./helpers/mobility";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await mapFixture(page);
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
});
test("home exposes empty history, labeled examples and the requested navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("No recent destinations yet", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator(".nr-rider-home-panel")
      .getByRole("button", { name: "Search destination", exact: true }),
  ).toContainText("Plan your ride");
  const mobile = page.viewportSize()!.width <= 800;
  if (mobile) await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: mobile ? "Rider navigation" : "NexRide", exact: true });
  for (const label of ["Home", mobile ? "My rides" : "Activity", "Safety", "Support", "Account"])
    await expect(navigation.getByRole("button", { name: mobile ? new RegExp(`^${label}`) : label, exact: !mobile })).toBeVisible();
  if (mobile) await page.keyboard.press("Escape");
  await expect(page.locator(".nr-live-location-dot")).toHaveCount(0);
  await expect(page.locator(".map-position")).toHaveCount(0);
});
test("a real browser location creates a centered marker and recenter moves the map", async ({
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
  await expect(page.locator(".nr-live-location-dot")).toHaveCount(1);
  await readyMap(page);
  await expect(page.locator(".nr-home-location")).toContainText("Current location");
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
      const dot = await page.locator(".nr-live-location-dot").boundingBox();
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
        clearWatch: () => {},
        watchPosition: (
          _ok: unknown,
          error: (e: { code: number; PERMISSION_DENIED?: number }) => void,
        ) => error({ code: 1, PERMISSION_DENIED: 1 }),
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Recenter on my location" }).click();
  await expect(page.locator(".nr-home-location")).toContainText(
    "Location access is off",
  );
  await expect(page.locator(".nr-live-location-dot")).toHaveCount(0);
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
        clearWatch: () => {},
        watchPosition: (
          _ok: unknown,
          error: (e: { code: number; PERMISSION_DENIED?: number }) => void,
        ) => {
          Object.assign(window, { failLocation: () => error({ code: 2 }) });
          return 1;
        },
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
  await page.evaluate(() => (window as unknown as { failLocation: () => void }).failLocation());
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
  await page.getByLabel("Search destination",{exact:true}).fill("Meskel");
  await page.locator(".nr-place-suggestion").filter({hasText: "Meskel Square"}).first().click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByLabel("Pickup", { exact: true }).fill("Bole Atlas");
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
  await page.getByLabel("Search destination", { exact: true }).fill("Piassa");
  await page.locator(".nr-place-suggestion").filter({ hasText: "Piassa" }).first().click();
  await expect(panel).toBeVisible();
  await page.reload();
  await panel.getByRole("button", { name: "Work", exact: true }).click();
  await expect(page.getByLabel("Search destination", { exact: true })).toHaveValue("Piassa");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await panel.getByRole("button", { name: "Home", exact: true }).click();
  await expect(page.getByLabel("Search destination", { exact: true })).toHaveValue("Meskel Square");
});
test("a failed map does not block destination search", async ({ page }) => {
  await page.route("https://api.mapbox.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByText("Map unavailable right now.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Search destination" }),
  ).toBeVisible();
});
test("small, landscape and desktop layouts keep map controls and ride actions reachable", async ({
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
    const control = (await page.getByRole("button",{name:"Recenter on my location",exact:true}).boundingBox())!;
    expect(control.x).toBeGreaterThanOrEqual(map.x);
    expect(control.y).toBeGreaterThanOrEqual(map.y);
    expect(control.x + control.width).toBeLessThanOrEqual(map.x + map.width);
    expect(control.y + control.height).toBeLessThanOrEqual(map.y + map.height);
    await reachableControl(page, ".nr-recenter");
    await expect(page.getByRole("button",{name:"Search destination",exact:true})).toBeInViewport();
    expect(panel.y + panel.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test("mobile focused destination search keeps saved and suggested places above the keyboard surface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "Search destination", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Search destination" });
  await input.focus();
  const root = page.locator(".rider-search-view");
  await expect(root).toHaveAttribute("data-search-open", "true");
  await expect(page.getByRole("heading", { name: "Recent places" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Popular places" })).toBeVisible();
  const panel = page.locator(".nr-destination-panel");
  const searchBody = page.locator(".nr-destination-body");
  const geometry = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('.nr-endpoint-field input:focus');
    const body = document.querySelector<HTMLElement>('.nr-destination-body');
    const box = document.querySelector<HTMLElement>('.nr-destination-panel');
    return { input: input?.getBoundingClientRect().toJSON(), body: body?.getBoundingClientRect().toJSON(), box: box?.getBoundingClientRect().toJSON() };
  });
  expect(geometry.box?.top).toBeGreaterThanOrEqual(-1);
  expect(geometry.box?.bottom).toBeLessThanOrEqual(781);
  expect(geometry.input?.top).toBeGreaterThanOrEqual(0);
  expect(geometry.input?.bottom).toBeLessThanOrEqual(geometry.box?.bottom || 0);
  expect(geometry.body?.height).toBeGreaterThan(100);
  await expect(panel).toBeVisible();
  await expect(searchBody).toHaveCSS("overflow-y", "auto");
  await input.fill("Bole");
  await expect(page.getByRole("heading", { name: "Suggested places" })).toBeVisible();
  await expect(page.locator(".nr-place-suggestion").first()).toBeVisible();
  await expect(root).toHaveAttribute("data-search-open", "true");
});

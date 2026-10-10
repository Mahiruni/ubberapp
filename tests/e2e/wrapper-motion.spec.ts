import { expect, test, type Page } from "@playwright/test";

const panel = (page: Page) => page.locator(".nr-rider-flow-panel");
const handle = (page: Page) => page.getByRole("button", { name: "Expand or collapse ride panel" });
const height = async (page: Page) => (await panel(page).boundingBox())!.height;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("nexride:preview-enabled", "true");
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => fail({ code: 1 }) } });
  });
  await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#f1f0f5"/></svg>' }));
  await page.goto("/");
  await expect(handle(page)).toBeVisible();
  await expect.poll(() => height(page)).toBeGreaterThan(100);
});

test("brand contrast and essential actions survive narrow screens and orientation changes", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 740, height: 390 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await handle(page).press("End");
    await expect.poll(async () => Math.abs(await height(page) - Math.min(viewport.height * .78, viewport.height - 72))).toBeLessThan(2);
    const box = (await panel(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(page.locator(".nr-home-sheet-grab-area")).toHaveCSS("background-color", "rgb(40, 33, 127)");
    await expect(page.getByRole("button", { name: "Search destination", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("keyboard positioning and reduced motion work without a pointer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(panel(page)).toHaveCSS("transition-duration", "0s");
  await handle(page).press("Home");
  await expect(page.locator(".nr-rider-home-sheet")).toHaveAttribute("data-snap", "collapsed");
  const small = await height(page);
  await handle(page).press("ArrowUp");
  expect(await height(page)).toBeGreaterThan(small);
  await handle(page).press("End");
  await expect(page.locator(".nr-rider-home-sheet")).toHaveAttribute("data-snap", "expanded");
  await handle(page).press("ArrowDown");
  await expect(page.locator(".nr-rider-home-sheet")).toHaveAttribute("data-snap", "medium");
  await expect(handle(page)).toBeFocused();
});

test("mouse movement follows the handle without a start jump or release click", async ({ page }) => {
  await expect.poll(async () => Math.abs(await height(page) - page.viewportSize()!.height * .5)).toBeLessThan(1);
  const before = await height(page), box = (await handle(page).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  expect(Math.abs(await height(page) - before)).toBeLessThan(2);
  await page.mouse.move(x, y - 180, { steps: 12 });
  await expect.poll(async () => Math.abs(await height(page) - before - 180)).toBeLessThan(2);
  await page.mouse.up();
  await expect(page.locator(".rider-map-flow")).not.toHaveAttribute("data-sheet-dragging", "true");
  await expect(page.locator(".nr-rider-home-sheet")).toHaveAttribute("data-snap", "expanded");
  await expect.poll(async () => Math.abs(await height(page) - page.viewportSize()!.height * .78)).toBeLessThan(1);
  const settled = await height(page);
  await page.mouse.move(x, y - 130);
  expect(Math.abs(await height(page) - settled)).toBeLessThan(1);
});

test("body scroll stays native and destination search retains its own keyboard handle", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(panel(page)).toHaveCSS("transition-duration", "0s");
  const body = page.locator(".nr-home-sheet-scroll");
  await expect(body).toHaveCSS("overflow-y", "auto");
  await expect(body).toHaveCSS("touch-action", "pan-y");
  const box = (await body.boundingBox())!;
  const before = await height(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => body.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  expect(Math.abs(await height(page) - before)).toBeLessThan(2);
  await page.getByRole("button", { name: "Search destination", exact: true }).click();
  const destination = page.getByRole("textbox", { name: "Search destination", exact: true });
  await expect(destination).toBeVisible();
  await destination.focus();
  const searchHandle = page.locator(".nr-flow-sheet-handle");
  if (page.viewportSize()!.width > 800) {
    await searchHandle.press("End");
    await expect(searchHandle).toHaveAttribute("aria-valuenow", "75");
  } else {
    // Focused mobile search deliberately becomes a full, scrollable surface.
    await expect(page.locator(".rider-search-view")).toHaveAttribute("data-search-open", "true");
    await expect(searchHandle).toBeHidden();
    const input = page.getByRole("textbox", { name: "Search destination", exact: true });
    await expect(input).toBeInViewport();
  }
  await expect(page.locator(".nr-destination-body")).toHaveCSS("overflow-y", "auto");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(handle(page)).toBeVisible();
});

test("real touch swipe and cancellation settle inside the viewport", async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== "chromium" || !isMobile, "Trusted swipe coverage runs on the Chromium touch device.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const client = await context.newCDPSession(page);
  const box = (await handle(page).boundingBox())!, before = await height(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (let step = 1; step <= 12; step++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 8, id: 1 }] });
  await expect.poll(async () => Math.abs(await height(page) - before - 96)).toBeLessThan(2);
  await client.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  await expect(page.locator(".rider-map-flow")).not.toHaveAttribute("data-sheet-dragging", "true");
  const settled = await height(page);
  await page.mouse.move(x, y - 150);
  expect(await height(page)).toBe(settled);
  const current = (await handle(page).boundingBox())!;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: current.y + 20, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 1, id: 2 }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await height(page)).toBeLessThanOrEqual(page.viewportSize()!.height - 72);
  await client.detach();
});

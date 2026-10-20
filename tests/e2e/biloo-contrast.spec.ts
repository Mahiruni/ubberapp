import { test, expect, type Locator, type Page } from "@playwright/test";

/* Measure the rendered RGB pair, not design tokens, so inherited legacy colors
   cannot silently erase a label when the device theme changes. */
const renderedContrast = async (target: Locator, surface: Locator) => target.evaluate((element, backgroundElement) => {
  const foreground = getComputedStyle(element).color;
  const background = getComputedStyle(document.querySelector(backgroundElement as string)!).backgroundColor;
  const channels = (v: string) => {
    const numbers = v.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!numbers || numbers.length < 3) throw new Error(`Unknown color ${v}`);
    return numbers.map(c => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
  };
  const lum = (v: string) => {
    const [r, g, b] = channels(v);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(foreground), b = lum(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}, await surface.evaluate(el => {
  const marker = "contrast-background-target";
  el.setAttribute("data-" + marker, "true");
  return '[data-' + marker + '="true"]';
}));

test.describe("Biloo rendered Rider and Driver contrast", () => {
  test("Rider's map-first home sheet remains readable in light and dark modes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem("nexride:preview-enabled", "true");
      localStorage.setItem("nexride.rider.aurora-light-v1", "1");
      localStorage.setItem("nexride.rider.theme", "light");
    });
    await page.route("https://tile.openstreetmap.org/**", route =>
      route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"/>' }));
    await page.goto("/");
    await expect(page.locator(".nr-rider-home-sheet")).toBeVisible();
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate(next => {
        localStorage.setItem("nexride.rider.theme", next);
        window.dispatchEvent(new Event("nexride:appearance-change"));
      }, theme);
      await expect(page.locator(".nr-app[data-mode=rider]")).toHaveAttribute("data-theme", theme);
      const title = page.locator(".nr-rider-home-intro h2");
      const titleSurface = page.locator(".nr-rider-home-intro");
      const shortcut = page.locator(".nr-home-shortcuts button").first();
      await expect(title).toBeVisible();
      await expect(shortcut).toBeVisible();
      const titleRatio = await renderedContrast(title, titleSurface);
      const shortcutRatio = await renderedContrast(shortcut, shortcut);
      expect(titleRatio, `Rider title in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
      expect(shortcutRatio, `Rider shortcut in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
      const surface = page.locator(".nr-home-sheet-scroll");
      const expected = theme === "dark" ? "rgb(16, 56, 111)" : "rgb(255, 255, 255)";
      await expect(surface).toHaveCSS("background-color", expected);
      await expect(page.getByRole("button", { name: "Search destination", exact: true })).toBeInViewport();
    }
  });
});

test("Driver's trip request wrapper stays legible across dark and light modes", async ({ page }) => {
  const driverId = "22222222-2222-4222-8222-222222222222";
  const requestId = "55555555-5555-4555-8555-555555555555";
  const offerId = "44444444-4444-4444-8444-444444444444";
  const user = { id: driverId, aud: "authenticated", role: "authenticated", email: "driver@example.test",
    app_metadata: {}, user_metadata: { role: "driver", full_name: "Biloo Driver" }, created_at: "2026-01-01T00:00:00Z" };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: driverId, exp: 4102444800 })).toString("base64url")}.test`;
  const session = { access_token: token, refresh_token: "test", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user };
  await page.addInitScript(({ session }) => {
    localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token", JSON.stringify(session));
    localStorage.setItem("nexride.driver.aurora-light-v1", "1");
    localStorage.setItem("nexride.driver.theme", "dark");
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      watchPosition: () => 1, clearWatch: () => {}, getCurrentPosition: () => {},
    } });
  }, { session });
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    const single = route.request().headers().accept?.includes("object+json");
    const respond = (value: object | null) => route.fulfill({ json: single ? value : value ? [value] : [] });
    if (name === "profiles") return respond({ id: driverId, role: "driver", full_name: "Biloo Driver" });
    if (name === "drivers") return respond({ id: driverId, review_status: "approved", is_online: true });
    if (name === "ride_request_offers") return respond({ id: offerId, request_id: requestId, driver_id: driverId,
      status: "pending", pickup_distance_km: 1.1, pickup_eta_minutes: 4,
      expires_at: new Date(Date.now() + 90000).toISOString(), created_at: new Date().toISOString() });
    if (name === "ride_requests") return respond({ id: requestId, rider_id: "33333333-3333-4333-8333-333333333333",
      pickup_location: "Bole, Addis Ababa", destination_location: "Mexico Square, Addis Ababa",
      pickup_lat: 8.998, pickup_lng: 38.790, destination_lat: 9.018, destination_lng: 38.751,
      ride_category: "Economy", status: "pending", estimated_trip_fare_etb: 235,
      estimated_driver_payout_etb: 195, estimated_trip_distance_km: 6.4,
      estimated_trip_duration_minutes: 20 });
    return respond(null);
  });
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { status: "unavailable" } }));
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  await page.goto(`/driver/request?offer=${offerId}`);
  const shell = page.locator(".nr-driver-app-shell");
  const wrapper = page.locator(".nr-driver-request-page .nr-request-sheet");
  await expect(wrapper).toBeVisible();
  for (const theme of ["dark", "light"] as const) {
    await page.evaluate(next => {
      localStorage.setItem("nexride.driver.theme", next);
      window.dispatchEvent(new Event("nexride:appearance-change"));
    }, theme);
    await expect(shell).toHaveAttribute("data-theme", theme);
    const title = wrapper.locator(".nr-request-route-copy strong").first();
    await expect(title).toBeVisible();
    expect(await renderedContrast(title, wrapper),
      `Driver request title in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
    await expect(wrapper).toHaveCSS("background-color",
      theme === "dark" ? "rgb(11, 43, 67)" : "rgb(255, 255, 255)");
    await expect(wrapper.getByRole("button", { name: "Accept" })).toBeInViewport();
  }
});

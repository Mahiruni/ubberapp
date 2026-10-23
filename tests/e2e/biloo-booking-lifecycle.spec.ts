import { test, expect, type Page } from "@playwright/test";
test.use({ video: "off" });
const riderId = "a1111111-1111-4111-8111-111111111111";
const requestId = "b1111111-1111-4111-8111-111111111111";
async function booking(page: Page) {
  const user = { id: riderId, aud: "authenticated", role: "authenticated", email: "rider@example.test", app_metadata: {}, user_metadata: { role: "rider", full_name: "Biloo Rider", phone: "+251912345678" }, created_at: "2026-01-01T00:00:00Z" };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: riderId, exp: 4102444800 })).toString("base64url")}.test`;
  await page.addInitScript(session => {
    localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token", JSON.stringify(session));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_ok: unknown, failure: (value: object) => void) => failure({ code: 1, message: "Denied" }),
      watchPosition: () => 1, clearWatch: () => {},
    } });
  }, { access_token: token, refresh_token: "test", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user });
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { status: "unavailable" } }));
  await page.route("**/api/rider/profile", route => route.fulfill({ json: { status: "ready" } }));
  await page.route("**/api/rider/search?*", route => route.fulfill({ json: { status: "ready", results: [] } }));
  await page.route("**/api/rider/route", route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ json: { status: "ready", coverage: { kind: "configured" }, route: { provider: "mapbox", distanceMeters: 4300, durationSeconds: 720, geometry: [[body.pickup.lat, body.pickup.lng], [body.destination.lat, body.destination.lng]] } } });
  });
  await page.route("**/api/rider/fares", route => route.fulfill({ json: { source: "service", revision: "qa-fare-1", expiresAt: new Date(Date.now() + 300_000).toISOString(), chargesComplete: true, offers: ["economy", "comfort", "xl"].map(category => ({ id: "quote-" + category, category, seats: 4, availability: category === "economy" ? "available" : "unavailable", pickupMinutes: null, amount: category === "economy" ? 200 : null, currency: "ETB", priceType: "estimate", charges: [] })) } }));
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    const object = route.request().headers().accept?.includes("object+json");
    const row = table === "profiles" ? { id: riderId, role: "rider", full_name: "Biloo Rider", phone: "+251912345678", account_status: "active" } : null;
    return route.fulfill({ json: object ? row : row ? [row] : [] });
  });
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
}
async function plan(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Search destination", exact: true }).click();
  await page.getByRole("textbox", { name: "Pickup", exact: true }).fill("Bole Atlas");
  await page.locator(".nr-place-suggestion").filter({ hasText: "Bole Atlas" }).first().click();
  await page.getByRole("textbox", { name: "Search destination", exact: true }).fill("Meskel Square");
  await page.locator(".nr-place-suggestion").filter({ hasText: "Meskel Square" }).first().click();
  await page.getByRole("button", { name: "Choose a ride", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a ride" })).toBeVisible();
}
test("manual pickup works with denied GPS and booking confirmation preserves one request key", async ({ page }) => {
  await booking(page);
  const keys: string[] = [];
  await page.route("**/api/rider/requests", async route => {
    keys.push(route.request().headers()["idempotency-key"]);
    const body = route.request().postDataJSON();
    expect(body.pickup.name).toBe("Bole Atlas");
    expect(body.destination.name).toBe("Meskel Square");
    expect(body.paymentMethod).toBe("cash");
    expect(body.pickupInstructions).toBe("Meet at the main entrance.");
    await route.fulfill({ json: { status: "accepted", requestId } });
  });
  await page.route(`**/api/rider/requests/${requestId}`, route => route.fulfill({ json: { requestId, version: 1, status: "searching", cancellation: { allowed: true, requiresConfirmation: false, fee: 0, reason: null }, canRetry: false, canChangeCategory: false } }));
  await plan(page);
  await page.getByRole("button", { name: "Request Economy", exact: true }).click();
  const confirm = page.getByRole("button", { name: "Request ride", exact: true });
  await expect(page.getByRole("dialog")).toContainText("Bole Atlas");
  await expect(page.getByRole("dialog")).toContainText("Meskel Square");
  await page.getByLabel("Pickup instructions (optional)").fill("Meet at the main entrance.");
  await confirm.click();
  await expect(page.locator(".nr-driver-matching")).toBeVisible();
  await expect(page.locator(".nr-confirmed-driver")).toHaveCount(0);
  expect(keys).toHaveLength(1);
  expect(keys[0].length).toBeGreaterThanOrEqual(16);
});
test("a booking transport failure remains retryable without inventing an assigned driver", async ({ page }) => {
  await booking(page);
  await page.route("**/api/rider/requests", route => route.abort("failed"));
  await plan(page);
  await page.getByRole("button", { name: "Request Economy", exact: true }).click();
  await page.getByRole("button", { name: "Request ride", exact: true }).click();
  await expect(page.locator(".nr-driver-matching")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request Economy", exact: true })).toBeEnabled();
  await expect(page.locator(".nr-ride-selection")).toContainText(/couldn|unconfirmed|confirm|try again/i);
});

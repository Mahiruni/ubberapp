import { test, expect, type Page } from "@playwright/test";

const rider = "11111111-1111-4111-8111-111111111111";
const driver = "22222222-2222-4222-8222-222222222222";
const replacementDriver = "44444444-4444-4444-8444-444444444444";
const id = "33333333-3333-4333-8333-333333333333";
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ sub: rider, exp: 4102444800 }),
).toString("base64url")}.test-signature`;
const user = {
  id: rider,
  aud: "authenticated",
  role: "authenticated",
  email: "rider@example.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};
const session = {
  access_token: token,
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user,
};

async function backend(page: Page) {
  let status = "accepted";
  let driverId: string | null = driver;
  let payment = "pending";
  let rating: number | null = null;
  let failRating = true;
  let stamp = new Date().toISOString();
  const requestedAt = new Date(Date.now() - 600_000).toISOString();
  const locationStamp = new Date().toISOString();

  await page.addInitScript(
    ({ session }) =>
      localStorage.setItem(
        "sb-eyyvvwecpyctttiueban-auth-token",
        JSON.stringify(session),
      ),
    { session },
  );
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/").pop();
    const objectResponse =
      route.request().headers().accept?.includes("object+json") === true;
    const one = (value: unknown) =>
      route.fulfill({ json: objectResponse ? value : value ? [value] : [] });

    expect(route.request().headers().authorization).toBe(`Bearer ${token}`);

    if (table === "ride_requests") {
      const row = {
        id,
        rider_id: rider,
        assigned_driver_id: driverId,
        status,
        pickup_location: "Real pickup",
        destination_location: "Real destination",
        pickup_lat: 9.01,
        pickup_lng: 38.76,
        destination_lat: 8.99,
        destination_lng: 38.79,
        ride_category: "comfort",
        estimated_trip_fare_etb: 235,
        final_fare_etb: status === "completed" ? 235 : null,
        payment_method: "cash",
        payment_status: payment,
        created_at: requestedAt,
        updated_at: stamp,
        completed_at: status === "completed" ? stamp : null,
        cancelled_at: null,
        estimated_trip_duration_minutes: 14,
        estimated_trip_distance_km: 5.2,
      };
      return one(row);
    }

    if (table === "profiles") {
      return one({
        full_name:
          driverId === driver ? "Connected Driver" : "Replacement Driver",
        phone: "+251900000001",
      });
    }

    if (table === "drivers") {
      return one({
        vehicle: "Toyota Yaris",
        vehicle_plate: "REAL-123",
        rating: 4.8,
        review_status: "approved",
        reviewed_at: null,
      });
    }

    if (table === "ride_driver_locations") {
      return one(
        driverId === driver
          ? {
              driver_id: driver,
              latitude: 9.005,
              longitude: 38.77,
              accuracy_meters: 35,
              heading_degrees: null,
              recorded_at: locationStamp,
            }
          : null,
      );
    }

    if (table === "ride_ratings") {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.ride_request_id).toBe(id);
        if (failRating) {
          failRating = false;
          return route.fulfill({
            status: 503,
            json: { message: "Temporary error" },
          });
        }
        rating = body.score;
        return route.fulfill({ json: { score: rating } });
      }
      return one(rating ? { score: rating } : null);
    }

    if (table === "ride_chat_messages") return one({ id: "message1" });
    return route.fulfill({
      status: 503,
      json: { message: `Unsupported test request: ${table}` },
    });
  });
  await page.route("https://*.tile.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf2ee"/></svg>',
    }),
  );
  await page.routeWebSocket("**/realtime/v1/**", (ws) => ws.close());

  return {
    change(next: string) {
      status = next;
      stamp = new Date().toISOString();
    },
    reassign() {
      driverId = replacementDriver;
      stamp = new Date().toISOString();
    },
    setPayment(next: string) {
      payment = next;
    },
  };
}

test("live rider sees assignment, real trip transition and receipt, then retries without losing feedback", async ({
  page,
}) => {
  const api = await backend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Resume your trip" }).click();

  const assigned = page.frameLocator('iframe[title="NexRide assigned driver"]');
  await expect(
    assigned.getByRole("heading", { name: "Connected Driver" }),
  ).toBeVisible();
  await expect(assigned.locator("#vehiclePlate")).toHaveText("REAL-123");
  await expect(assigned.locator("#verification")).toBeHidden();
  await expect(assigned.locator("#etaUnit")).toHaveText("ETA unavailable");
  await expect(assigned.locator("#demoBar")).toBeHidden();

  await assigned
    .getByRole("button", { name: "Cancel ride", exact: true })
    .click();
  await expect(assigned.getByRole("dialog")).toContainText(
    "could not load the cancellation fee",
  );
  await assigned.getByRole("button", { name: "Close dialog" }).click();

  api.change("in_trip");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const active = page.frameLocator('iframe[title="NexRide active trip"]');
  await expect(
    active.getByRole("heading", { name: "On trip", exact: true }),
  ).toBeVisible();

  await active.getByRole("button", { name: "Share trip", exact: true }).click();
  await expect(active.getByRole("dialog")).toContainText(
    "There is no timed access",
  );
  await active.getByRole("button", { name: "Close dialog" }).click();

  await page.context().setOffline(true);
  await expect(active.locator("#trackingText")).toContainText(
    "Location last updated",
  );
  await expect(
    active.getByRole("button", { name: "Safety", exact: true }),
  ).toBeEnabled();
  await page.context().setOffline(false);

  api.change("completed");
  api.setPayment("failed");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const receipt = page.frameLocator(
    'iframe[title="NexRide trip receipt and rating"]',
  );
  await expect(
    receipt.getByRole("heading", { name: "Trip completed!", exact: true }),
  ).toBeVisible();
  await expect(receipt.locator("#paymentStatus")).toHaveText("Payment failed");
  await expect(receipt.locator("#finalAmount")).toContainText("235");

  await receipt.getByRole("radio", { name: "4 stars", exact: true }).check();
  await receipt.getByText("Add optional feedback").click();
  await receipt
    .getByRole("textbox")
    .fill("Keep this feedback during retry");
  await receipt.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(
    receipt.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(receipt.getByRole("textbox")).toHaveValue(
    "Keep this feedback during retry",
  );
  await receipt.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    receipt.getByText("Thank you for your feedback.", { exact: true }),
  ).toBeVisible();
  await expect(receipt.locator("#paymentStatus")).toHaveText("Payment failed");
  await receipt
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(receipt.getByRole("dialog")).toContainText("REAL-123");
});

test("reassignment clears the old vehicle position and never displays an unsupported verification", async ({
  page,
}) => {
  const api = await backend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Resume your trip" }).click();

  const assigned = page.frameLocator('iframe[title="NexRide assigned driver"]');
  await expect(
    assigned.getByRole("heading", { name: "Connected Driver" }),
  ).toBeVisible();

  api.reassign();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(
    assigned.getByRole("heading", { name: "Replacement Driver" }),
  ).toBeVisible();
  await expect(assigned.locator("#verification")).toBeHidden();
  await expect(assigned.locator("#trackingText")).toHaveText(
    "Driver location unavailable",
  );

  const state = await assigned.locator("body").evaluate(
    () =>
      (
        window as unknown as {
          NexRide: { getSnapshot(): { tracking: unknown } };
        }
      ).NexRide.getSnapshot(),
  );
  expect(state.tracking).toBeNull();
});

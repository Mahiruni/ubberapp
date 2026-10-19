import { test, expect, type Page } from "@playwright/test";

test.use({ video: 'off' });

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
  user_metadata: { role: "rider" },
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

async function authenticate(page: Page) {
  await page.addInitScript(session => localStorage.setItem('sb-eyyvvwecpyctttiueban-auth-token', JSON.stringify(session)), session);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Resume your trip' })).toBeVisible();
}

async function backend(page: Page) {
  let status = "accepted";
  let portraitPath = ""; let signedRevision = 0;
  let driverId: string | null = driver;
  let payment = "pending";
  let rating: number | null = null;
  let failRating = true;
  let stamp = new Date().toISOString();
  const requestedAt = new Date(Date.now() - 600_000).toISOString();
  const locationStamp = new Date().toISOString();

  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({ json: session }),
  );
  await page.route("**/auth/v1/user", (route) => route.fulfill({ json: user }));
  await page.route("**/api/rider/trips/*/driver", route => route.fulfill({ json: { status: 'ready', driver: { id: driverId, name: driverId === driver ? 'Connected Driver' : 'Replacement Driver', photo: null, phone: '+251900000001', rating: 4.8, tripCount: 7, vehicle: { model: 'Toyota Yaris', color: 'Silver', plate: 'REAL-123' }, verification: null } } }));
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

    if (table === "driver_profile_photos") return one(portraitPath ? {storage_path:portraitPath} : null);
    if (table === "account_roles") return route.fulfill({json:[{user_id:rider,role:'rider',status:'active'}]});
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
  await page.route('**/storage/v1/object/sign/**', route => route.request().method() === 'POST'
    ? route.fulfill({json:{signedURL:`/object/sign/nexride-driver-photos/${portraitPath}?token=${++signedRevision}`}})
    : route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c2foAAAAASUVORK5CYII=','base64')}));
  await page.routeWebSocket("**/realtime/v1/**", (ws) => ws.close());

  return {
    photo(path: string) { portraitPath=path; },
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
  await authenticate(page);
  await page.getByRole("button", { name: "Resume your trip" }).click();

  const assigned = page.locator('.nr-accepted-driver-card');
  await expect(assigned.getByRole('heading', { name: 'Connected Driver' })).toBeVisible();
  await expect(assigned.locator('.nr-identity-plate')).toHaveText('REAL-123');
  await expect(assigned.locator('.nr-identity-verified')).toHaveCount(0);
  await expect(assigned).toContainText('ETA unavailable');
  await expect(assigned.getByRole('button', { name: 'Call Driver' })).toBeEnabled();
  await expect(assigned).toContainText('235 ETB');
  await page.screenshot({path: `/tmp/nexride-accepted-${test.info().project.name}.png`});
  api.change('arrived_pickup');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(assigned.getByRole('heading', { name: 'Your driver has arrived' })).toBeVisible();
  api.change('in_trip');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(assigned.getByRole('heading', { name: 'On trip', exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await expect(assigned.getByText('Reconnecting · last confirmed information')).toBeVisible();
  await expect(assigned.getByRole('button', { name: 'Safety', exact: true })).toBeEnabled();
  await page.context().setOffline(false);
  api.change("completed");
  api.setPayment("failed");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  const receipt = page.frameLocator(
    'iframe[title="Biloo trip receipt and rating"]',
  );
  await expect(
    receipt.getByRole("heading", { name: "You’ve arrived", exact: true }),
  ).toBeVisible();
  await expect(receipt.locator("#paymentStatus")).toHaveText("Cash payment");
  await expect(receipt.locator("#finalAmount")).toContainText("235");

  await receipt.getByRole("radio", { name: "4 stars", exact: true }).check();
  await receipt.getByText("Add optional feedback").click();
  await receipt
    .getByRole("textbox")
    .fill("Keep this feedback during retry");
  await receipt.getByRole("button", { name: "Submit rating", exact: true }).click();
  await expect(
    receipt.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await expect(receipt.getByRole("textbox")).toHaveValue(
    "Keep this feedback during retry",
  );
  await receipt.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    receipt.getByText("Thanks for your feedback.", { exact: true }),
  ).toBeVisible();
  await expect(receipt.locator("#paymentStatus")).toHaveText("Cash payment");
  await receipt
    .getByRole("button", { name: "View details", exact: true })
    .click();
  await expect(receipt.getByRole("dialog")).toContainText("REAL-123");
});

test("reassignment clears the old vehicle position and never displays an unsupported verification", async ({
  page,
}) => {
  const api = await backend(page);
  await authenticate(page);
  await page.getByRole("button", { name: "Resume your trip" }).click();

  const assigned = page.locator('.nr-accepted-driver-card');
  await expect(assigned.getByRole('heading', { name: 'Connected Driver' })).toBeVisible();
  api.reassign();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(assigned.getByRole('heading', { name: 'Replacement Driver' })).toBeVisible();
  await expect(assigned.locator('.nr-identity-verified')).toHaveCount(0);
  await expect(assigned).not.toContainText('Connected Driver');
});

test('authorized assigned portrait refreshes and deletion restores fallback during an active ride', async ({page}) => {
  const api=await backend(page); api.photo(`${driver}/first.jpg`); await authenticate(page); await page.getByRole('button',{name:'Resume your trip'}).click();
  const photo=page.locator('.nr-identity-portrait img'); await expect(photo).toHaveAttribute('src',/first[.]jpg/);
  api.photo(`${driver}/replacement.jpg`); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(photo).toHaveAttribute('src',/replacement[.]jpg/);
  api.photo(''); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await expect(photo).toHaveCount(0); await expect(page.locator('.nr-identity-portrait')).toHaveText('CD');
  await expect(page.getByRole('heading',{name:'Your driver is on the way'})).toBeVisible();
});

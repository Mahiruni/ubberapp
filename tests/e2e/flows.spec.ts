import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride:preview-enabled", "true"),
  );
});

test("rider can complete an explicitly labeled preview and save a rating", async ({
  page,
}) => {
  await page.goto("/");
  // Compact Rider layouts may hide this decorative map chip, but must retain
  // explicit preview identity and disclose preview behavior before booking.
  await expect(page.locator(".nr-map-preview-chip")).toHaveCount(1);
  // Recent destinations are user-specific; begin through the public Rider search.
  await page.getByRole("button", { name: "Search destination", exact: true }).click();
  await page.getByLabel("Search destination", { exact: true }).fill("Bole Airport");
  await page.locator(".nr-place-suggestion")
    .filter({ hasText: "Bole International Airport" }).first().click();
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
  await page.getByRole("radio", { name: /Comfort/ }).click();
  await page.getByRole("button", { name: /Preview this ride/ }).click();
  await expect(
    page.getByRole("heading", { name: "Finding your driver…" }),
  ).toBeVisible();
  await page.getByText("Preview matching states", {exact:true}).click();
  await page.getByRole("button", { name: "Preview assigned driver" }).click();
  const assigned = page.frameLocator('iframe[title="NexRide assigned driver"]');
  await expect(assigned.getByText('Driver on the way', {exact:true})).toBeVisible();
  await assigned.getByRole('button', {name:'Chat',exact:true}).click();
  await expect(assigned.getByRole('dialog')).toContainText('not delivered');
  await assigned.getByRole('button', {name:'Close dialog'}).click();
  await page.getByRole('button', {name:'Start trip',exact:true}).click();
  const active = page.frameLocator('iframe[title="NexRide active trip"]');
  await expect(active.getByRole('heading', {name:'On trip',exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Complete trip',exact:true}).click();
  const receipt = page.frameLocator('iframe[title="NexRide trip receipt and rating"]');
  await expect(receipt.getByRole('heading', {name:'You’ve arrived',exact:true})).toBeVisible();
  await receipt.getByRole('radio', {name:/5 star/}).check();
  await receipt.getByRole('button', {name:'Submit rating',exact:true}).click();
  await expect(receipt.getByText('Thanks for your feedback.',{exact:true})).toBeVisible();
  await page.reload();
  const trip = await page.evaluate(
    () => JSON.parse(localStorage.getItem("nexride-preview-v2")!).trip,
  );
  expect(trip).toMatchObject({ completed: true, rating: 5, ride: "comfort" });
});

test("driver mode never simulates availability without an authenticated eligible driver", async ({
  page,
}) => {
  await page.goto("/");
  // Exercise the public Driver entry independently of the authenticated Rider
  // menu (which has dedicated navigation tests).
  await page.goto("/driver");
  await expect(page).toHaveURL(/\/driver(?:\/|$)/);
  // Public Driver onboarding must never expose authenticated availability.
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Go Online", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Preview going online/i }),
  ).toHaveCount(0);
});

test("Amharic, profile edits, keyboard dialogs, and local storage migration work", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nexride-state",
      JSON.stringify({
        form: {
          name: "Test Rider",
          phone: "+251900000000",
          email: "",
          password: "obsolete-preview-password",
        },
      }),
    ),
  );
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("nexride-state")))
    .toBeNull();
  // Deep links are part of the Rider Account navigation contract.
  await page.goto("/?screen=profile");
  await page
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByLabel("Full name", { exact: true }).fill("NexRide Test");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(
    page.getByRole("heading", { name: "NexRide Test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "አማርኛ", exact: true }).last().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "am");
  await expect(
    page.getByRole("heading", { name: "የእርስዎ መለያ", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ቅንብሮች", exact: true }).last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const stored = await page.evaluate(() =>
    localStorage.getItem("nexride-preview-v2"),
  );
  expect(stored).not.toContain("password");
  expect(stored).toContain("NexRide Test");
});

test("small screens keep map, navigation and sheets within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Search destination", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("not-a-place");
  await expect(
    page.getByText("No places found. Try a nearby landmark."),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Meskel");
  await page
    .getByRole("button", { name: /Meskel Square/ })
    .first()
    .click();
  await expect(
    page.getByLabel("Pickup location", { exact: true }),
  ).toBeVisible();
  // While the pickup is incomplete, the action can be hidden while text search
  // is active or rendered disabled once the keyboard is dismissed.
  const action = page.locator(".nr-destination-panel footer button");
  if (await action.count()) await expect(action).toBeDisabled();
  else await expect(page.locator(".nr-destination-panel footer")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

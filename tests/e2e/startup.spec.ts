import { test, expect } from "@playwright/test";

const sessionKey = "sb-eyyvvwecpyctttiueban-auth-token";
const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "preview-test-user", exp: 4102444800 })).toString("base64url")}.test-signature`;
const restoredSession = {
  access_token: token,
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800,
  user: {
    id: "preview-test-user",
    aud: "authenticated",
    role: "authenticated",
    email: "test@example.com",
    app_metadata: {},
    user_metadata: { role: "rider" },
    created_at: "2026-01-01T00:00:00Z",
  },
};

test("first visit leads to onboarding, then authentication, then explicit preview", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Continue to sign in" }).click();
  await expect(page).toHaveURL(/\/rider\/sign-in$/);
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Explore the preview" }).click();
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nr-rider-splash")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .first()
    .click();
  await expect(page.locator(".nr-rider-splash")).toHaveCount(0);
});

test("completed onboarding sends a signed-out user to authentication", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride:onboarding-complete", "true"),
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/rider\/sign-in$/);
});

test("a restored Supabase session opens rider home", async ({ page }) => {
  await page.addInitScript(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: sessionKey, session: restoredSession },
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".nr-map-preview-chip")).toBeVisible();
});

test("corrupt local preferences present a recoverable error", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("nexride-preview-v2", "invalid-json"),
  );
  await page.goto("/");
  await expect(page.locator(".nr-splash-error")).toContainText(
    "We couldn’t open NexRide.",
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".nr-splash-error")).toBeVisible();
  await page
    .getByRole("button", { name: "Reset local preview settings" })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test("the real session wait shows the splash and honors reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(
    ({ key, session }) =>
      localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1 })),
    { key: sessionKey, session: restoredSession },
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/v1/token**", async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(restoredSession),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const splash = page.locator(".nr-rider-splash");
  await expect(splash).toBeVisible();
  await expect(splash).toHaveAttribute("aria-busy", "true");
  await expect(
    splash.getByRole("heading", { name: "NexRide", exact: true }),
  ).toBeVisible();
  await expect(
    splash.getByText("Better Rides. A Brighter Tomorrow."),
  ).toBeVisible();
  await expect(page.locator(".nr-splash-mark")).toHaveCSS(
    "animation-name",
    "none",
  );
  await expect(splash.locator(".nr-splash-mark")).toHaveAttribute(
    "src",
    /\/brand\/nexride-mark\.svg$/,
  );
  await expect(splash.locator(".nr-splash-progress")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/splash-${test.info().project.name}.png`,
  });
  release();
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
  await expect(splash).toHaveCount(0);
});

test("a stalled session restoration can be retried", async ({ page }) => {
  await page.addInitScript(
    ({ key, session }) =>
      localStorage.setItem(key, JSON.stringify({ ...session, expires_at: 1 })),
    { key: sessionKey, session: restoredSession },
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/auth/v1/token**", async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(restoredSession),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".nr-splash-error")).toContainText(
    "We couldn’t open NexRide.",
    { timeout: 12000 },
  );
  release();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
});

test("authentication uses Supabase and never stores a password in preview preferences", async ({
  page,
}) => {
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(restoredSession),
    }),
  );
  await page.goto("/rider/sign-in");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("test@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page
    .getByRole("button", { name: "Sign in to NexRide", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Search destination", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("nexride-preview-v2")),
  ).not.toContain("password");
});

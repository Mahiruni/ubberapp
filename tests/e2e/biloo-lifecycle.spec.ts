import { test, expect, type Page } from "@playwright/test";
test.use({ video: "off" });
const id = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
async function account(page: Page, initialStatus: string, role = "driver") {
  let status = initialStatus;
  let fail = false;
  let signupCalls = 0;
  const user = { id, aud: "authenticated", role: "authenticated", email: "driver@example.test",
    app_metadata: {}, user_metadata: { role: "admin", driver_onboarding_complete: true, full_name: "Biloo Driver", vehicle: "Toyota Yaris", vehicle_color: "white", vehicle_plate: "AA1234" }, created_at: "2026-01-01T00:00:00Z" };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: 4102444800 })).toString("base64url")}.test`;
  const session = { access_token: token, refresh_token: "test", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user };
  await page.addInitScript(session => localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token", JSON.stringify(session)), session);
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/auth/v1/signup*", route => { signupCalls++; return route.fulfill({ status: 500, json: {} }); });
  await page.route("**/api/**", route => route.fulfill({ status: 503, json: { status: "unavailable" } }));
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    const object = route.request().headers().accept?.includes("object+json");
    const one = (value: unknown) => route.fulfill({ json: object ? value : value ? [value] : [] });
    if (table === "profiles") return one({ id, role, full_name: "Biloo Driver", phone: "+251912345678", account_status: "active" });
    if (table === "drivers") return fail ? route.fulfill({ status: 503, json: { message: "private_database_error" } })
      : one({ id, review_status: status, is_online: false, vehicle: "Toyota Yaris", vehicle_color: "white", vehicle_plate: "AA1234", rejection_reason: status === "rejected" ? "Upload a clear licence photograph." : null });
    return route.fulfill({ json: object ? null : [] });
  });
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
  return { session, user, setStatus: (value: string) => { status = value; }, fail: (value: boolean) => { fail = value; }, signupCalls: () => signupCalls };
}
test("pending Driver resumes verification with no dashboard approval bypass", async ({ page }) => {
  await account(page, "pending");
  await page.goto("/driver");
  await expect(page).toHaveURL(/\/driver\/verification$/);
  await expect(page.getByRole("heading", { name: "Application under review" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Online/ })).toHaveCount(0);
  await page.goto("/driver/home");
  await expect(page).toHaveURL(/\/driver\/verification$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Application under review" })).toBeVisible();
});
test("rejected Driver sees the saved correction reason and can resume", async ({ page }) => {
  await account(page, "rejected");
  await page.goto("/driver");
  await expect(page.getByRole("heading", { name: "Action required" })).toBeVisible();
  await expect(page.locator("main [role=alert]")).toContainText("Upload a clear licence photograph.");
  await expect(page.getByRole("button", { name: "Submit for review" })).toBeVisible();
});
test("suspended Driver cannot open operational home and retains support access", async ({ page }) => {
  await account(page, "suspended");
  await page.goto("/driver/home");
  await expect(page).toHaveURL(/\/driver\/verification$/);
  await expect(page.getByRole("heading", { name: "Driving access suspended" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Contact support", exact: true })).toHaveAttribute("href", "/support?role=driver");
});
test("approval refresh unlocks the dashboard from authoritative status", async ({ page }) => {
  const backend = await account(page, "pending");
  await page.goto("/driver/verification");
  await expect(page.getByRole("heading", { name: "Application under review" })).toBeVisible();
  backend.setStatus("approved");
  await page.getByRole("button", { name: "Refresh review status" }).click();
  await expect(page.getByRole("heading", { name: "You’re verified" })).toBeVisible();
  await page.getByRole("button", { name: "Open Driver dashboard" }).click();
  await expect(page).toHaveURL(/\/driver\/home$/);
  await expect(page.locator(".nr-splash-error")).toHaveCount(0);
});
test("a failed status lookup offers retry instead of opening home or logging out", async ({ page }) => {
  const backend = await account(page, "pending");
  backend.fail(true);
  await page.goto("/driver/home");
  await expect(page.locator(".nr-splash-error")).toBeVisible();
  backend.fail(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page).toHaveURL(/\/driver\/verification$/);
});
test("verification recovers after interruption without showing a fake draft form", async ({ page }) => {
  const backend = await account(page, "pending");
  backend.fail(true);
  await page.goto("/driver/verification");
  await expect(page.getByRole("heading", { name: "Let’s reconnect" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
  backend.fail(false);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Application under review" })).toBeVisible();
});
test("existing Rider applies through the same identity and must accept terms", async ({ page }) => {
  const backend = await account(page, "draft", "rider");
  await page.goto("/driver/onboarding");
  await expect(page.getByRole("heading", { name: "Apply to Drive" })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Email address", { exact: true })).toHaveValue("driver@example.test");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  expect(backend.signupCalls()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("valid signup code continues into the existing Rider session without a second sign-in", async ({ page }) => {
  const backend = await account(page, "draft", "rider");
  let signouts = 0;
  await page.route("**/auth/v1/verify", route => route.fulfill({ json: backend.session }));
  await page.route("**/auth/v1/logout*", route => { signouts++; return route.fulfill({ json: {} }); });
  await page.route("**/api/rider/profile", route => route.fulfill({ json: { status: "ready" } }));
  await page.goto("/rider/verify-email");
  await page.getByLabel("Email address", { exact: true }).fill("driver@example.test");
  await page.locator("summary").click();
  await page.getByLabel("Email verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Search destination", exact: true })).toBeVisible();
  expect(signouts).toBe(0);
});
test("invalid verification code preserves recovery and never advances to home", async ({ page }) => {
  await page.route("**/auth/v1/verify", route => route.fulfill({ status: 403, json: { code: "otp_expired", message: "Invalid or expired code" } }));
  await page.goto("/rider/verify-email");
  await page.getByLabel("Email address", { exact: true }).fill("person@example.test");
  await page.locator("summary").click();
  await page.getByLabel("Email verification code", { exact: true }).fill("111111");
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toBeVisible();
  await expect(page).toHaveURL(/\/rider\/verify-email$/);
  await expect(page.getByRole("button", { name: "Verify email", exact: true })).toBeEnabled();
});

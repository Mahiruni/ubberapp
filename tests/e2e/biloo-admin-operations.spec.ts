import { test, expect, type Page } from "@playwright/test";
test.use({ video: "off" });
const adminId = "a8888888-aaaa-4888-8888-aaaaaaaaaaaa";
const driverId = "b8888888-bbbb-4888-8888-bbbbbbbbbbbb";
async function admin(page: Page) {
  let status = "pending";
  const user = { id: adminId, aud: "authenticated", role: "authenticated", email: "admin@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: adminId, exp: 4102444800 })).toString("base64url")}.test`;
  await page.addInitScript(session => localStorage.setItem("sb-eyyvvwecpyctttiueban-auth-token", JSON.stringify(session)), { access_token: token, refresh_token: "test", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user });
  await page.route("**/auth/v1/user", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => {
    const table = new URL(route.request().url()).pathname.split("/").pop();
    const object = route.request().headers().accept?.includes("object+json");
    const one = (value: unknown) => route.fulfill({ json: object ? value : value ? [value] : [] });
    if (table === "profiles") return one({ id: adminId, full_name: "Biloo Operator", role: "admin", admin_role: "super_admin", account_status: "active" });
    if (table === "drivers") return one({ id: driverId, review_status: status, vehicle: "Toyota Yaris", vehicle_plate: "QA1234", is_online: false, created_at: "2026-10-20T10:00:00Z" });
    if (table === "admin_dashboard_summary") return route.fulfill({ json: {} });
    if (table === "admin_review_driver_application") {
      const body = route.request().postDataJSON();
      expect(body.p_driver_id).toBe(driverId);
      expect(body.p_reason).toBe("Please upload a clearer registration certificate.");
      status = body.p_status;
      return route.fulfill({ json: { id: driverId, review_status: status } });
    }
    return route.fulfill({ json: object ? null : [] });
  });
  await page.routeWebSocket("**/realtime/v1/**", ws => ws.close());
}
test("Admin records an actionable correction and shows the saved Driver state", async ({ page }) => {
  await admin(page);
  await page.goto("/admin");
  await expect(page.locator(".admin-sidebar").getByText("Biloo Operator")).toBeAttached();
  if (await page.locator(".admin-mobile-nav").isVisible()) await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".admin-sidebar").getByRole("button", { name: "Drivers", exact: true }).click();
  await page.getByRole("button", { name: "Request corrections / reject", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill("Please upload a clearer registration certificate.");
  await dialog.getByRole("button", { name: "Confirm decision" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator(".table-wrap")).toContainText("rejected");
  await expect(page.getByRole("button", { name: "Reopen review" })).toBeVisible();
});
test("Admin financial inspection remains read-only and shows saved payment state", async ({ page }) => {
  await admin(page);
  let mutations = 0;
  await page.route("**/api/admin/operations?*", route => {
    if (route.request().method() !== "GET") mutations++;
    return route.fulfill({ json: { record: { mode: "Read-only financial oversight", currency: "ETB" }, sections: [{ title: "Settlement requests", rows: [{ id: "saved", amount_etb: 200, status: "pending" }], unavailable: false }], note: "Saved records only. A posting or commission quote is not payment confirmation." } });
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-sidebar").getByText("Biloo Operator")).toBeAttached();
  if (await page.locator(".admin-mobile-nav").isVisible()) await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator(".admin-sidebar").getByRole("button", { name: "Payments", exact: true }).click();
  await page.getByRole("button", { name: "Financial oversight", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("pending");
  await expect(dialog).toContainText("not payment confirmation");
  await expect(dialog.getByRole("button", { name: /Pay|Settle|Activate/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect(mutations).toBe(0);
});

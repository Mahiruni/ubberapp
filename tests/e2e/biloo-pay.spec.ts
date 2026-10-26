import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { createHmac } from "node:crypto";

test.skip(
  process.env.BILOO_PAY_LOCAL_TEST !== "1",
  "Use npm run test:payments:e2e for the isolated local PostgreSQL/provider fixtures",
);
const ids = {
  rider: "10000000-0000-4000-8000-000000000001",
  driver: "20000000-0000-4000-8000-000000000001",
  admin: "50000000-0000-4000-8000-000000000001",
  cash: "30000000-0000-4000-8000-000000000001",
  digital: "30000000-0000-4000-8000-000000000002",
};
const token = (role: keyof Pick<typeof ids, "rider" | "driver" | "admin">) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: ids[role], exp: 4102444800 })).toString("base64url")}.LOCAL_TEST_ONLY`;
async function session(page: Page, role: "rider" | "driver" | "admin") {
  await page.addInitScript(
    ({ access_token, id, role }) => {
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token,
          refresh_token: "LOCAL_TEST_ONLY",
          expires_at: 4102444800,
          expires_in: 3600,
          token_type: "bearer",
          user: {
            id,
            email: role + "@example.test",
            aud: "authenticated",
            role: "authenticated",
            app_metadata: {},
            user_metadata: { role, full_name: "TEST " + role },
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
      localStorage.setItem("nexride:onboarding-complete", "true");
      localStorage.setItem("biloo.pay.theme", "light");
    },
    { access_token: token(role), id: ids[role], role },
  );
  await page.routeWebSocket("**/realtime/v1/**", (ws) => ws.close());
  await page.route("https://**/*", (route) => route.abort());
}
async function initialize(request: APIRequestContext) {
  const response = await request.post("/api/payments/chapa/initialize", {
    headers: {
      Authorization: "Bearer " + token("rider"),
      "Idempotency-Key": "isolated_checkout_key_001",
    },
    data: { rideRequestId: ids.digital },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe("ready");
  return new URL(body.checkoutUrl).pathname.replace("/TEST-ONLY-", "");
}
async function webhook(request: APIRequestContext, ref: string) {
  const raw = JSON.stringify({
    event: "charge.success",
    tx_ref: ref,
    currency: "ETB",
    mode: "test",
  });
  const signature = createHmac("sha256", "local-test-webhook-secret")
    .update(raw)
    .digest("hex");
  return request.post("/api/payments/chapa/webhook", {
    headers: {
      "x-chapa-signature": signature,
      "Content-Type": "application/json",
    },
    data: raw,
  });
}
test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:54391/__test/reset")).ok()).toBe(
    true,
  );
});

test("cash confirmation crosses the UI, actual API and PostgreSQL without crediting a wallet", async ({
  page,
  request,
}, info) => {
  await session(page, "driver");
  await page.goto("/driver/wallet");
  await expect(
    page.getByRole("heading", { name: "Driver Wallet" }),
  ).toBeVisible();
  await expect(page.getByTestId("available-balance")).toContainText("0.00");
  await page.getByRole("button", { name: "Confirm cash", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Confirm cash received" }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm cash received" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByText("Cash confirmations are up to date"),
  ).toBeVisible();
  await expect(page.getByTestId("available-balance")).toContainText("0.00");
  await expect(
    page.locator(".bp-metric").filter({ hasText: "Cash commission due" }),
  ).toContainText("20.00");
  const counts = await (
    await request.get("http://127.0.0.1:54391/__test/counts")
  ).json();
  expect(counts).toEqual({ journals: 1, settlements: 1 });
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Cash received by driver", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("driver-wallet-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("driver-wallet-dark.png"),
    fullPage: true,
  });
});

test("checkout replay and callbacks cannot create duplicate payment records", async ({
  page,
  request,
}, info) => {
  await session(page, "rider");
  await page.goto("/rider/wallet?payment=paid");
  // A success parameter is never proof. Before verification the receipt list remains empty.
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText("No Biloo Pay receipts yet")).toBeVisible();
  const ref = await initialize(request);
  const repeat = await initialize(request);
  expect(repeat).toBe(ref);
  await request.post("http://127.0.0.1:54391/__test/provider", {
    data: { state: "pending" },
  });
  expect((await webhook(request, ref)).status()).toBe(503);
  const callback = await request.get(
    "/api/payments/chapa/callback?tx_ref=" + ref + "&status=success",
  );
  expect((await callback.json()).status).toBe("verification_pending");
  await request.post("http://127.0.0.1:54391/__test/provider", {
    data: { state: "success" },
  });
  expect((await webhook(request, ref)).status()).toBe(200);
  expect((await webhook(request, ref)).status()).toBe(200);
  await page.getByRole("button", { name: "Refresh payment records" }).click();
  await expect(
    page.getByText("Chapa payment verified", { exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get("http://127.0.0.1:54391/__test/counts")).json(),
  ).toEqual({ journals: 1, settlements: 1 });
  await page.screenshot({
    path: info.outputPath("rider-payments.png"),
    fullPage: true,
  });
});

test("withdrawal stays reserved until provider verification and a duplicate request reuses its hold", async ({
  page,
  request,
}) => {
  const ref = await initialize(request);
  expect((await webhook(request, ref)).ok()).toBe(true);
  let key = "";
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/api/driver/payouts"))
      key = r.headers()["idempotency-key"];
  });
  await session(page, "driver");
  await page.goto("/driver/wallet");
  await expect(page.getByTestId("available-balance")).toContainText("160.00");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in ETB").fill("100.00");
  await dialog.getByRole("button", { name: "Request withdrawal" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByTestId("available-balance")).toContainText("60.00");
  await expect(page.getByText("Processing", { exact: true })).toBeVisible();
  const snap = await (
    await request.get("/api/biloo-pay/snapshot", {
      headers: { Authorization: "Bearer " + token("driver") },
    })
  ).json();
  const payout = snap.payouts[0];
  const payoutEvent = JSON.stringify({
    event: "payout.success",
    reference: payout.reference,
    mode: "test",
    currency: "ETB",
  });
  const payoutSignature = createHmac("sha256", "local-test-webhook-secret")
    .update(payoutEvent)
    .digest("hex");
  const payoutWebhook = await request.post("/api/payments/chapa/webhook", {
    headers: {
      "x-chapa-signature": payoutSignature,
      "Content-Type": "application/json",
    },
    data: payoutEvent,
  });
  expect((await payoutWebhook.json()).status).toBe("paid");
  const duplicate = await request.post("/api/driver/payouts", {
    headers: {
      Authorization: "Bearer " + token("driver"),
      "Idempotency-Key": key,
    },
    data: { amountEtb: "100.00" },
  });
  expect((await duplicate.json()).requestId).toBe(payout.id);
  const verified = await request.patch("/api/driver/payouts", {
    headers: { Authorization: "Bearer " + token("driver") },
    data: { requestId: payout.id },
  });
  expect((await verified.json()).status).toBe("paid");
  await page.getByRole("button", { name: "Refresh payment records" }).click();
  await expect(page.getByText("Verified paid", { exact: true })).toBeVisible();
  await expect(page.getByTestId("available-balance")).toContainText("60.00");
  // A later reversal is reviewed; it never fabricates a credit or silently clears a hold.
  const reversal = JSON.stringify({
    event: "payout.reversed",
    reference: payout.reference,
    mode: "test",
    currency: "ETB",
  });
  const reversalSignature = createHmac("sha256", "local-test-webhook-secret")
    .update(reversal)
    .digest("hex");
  expect(
    (
      await (
        await request.post("/api/payments/chapa/webhook", {
          headers: {
            "x-chapa-signature": reversalSignature,
            "Content-Type": "application/json",
          },
          data: reversal,
        })
      ).json()
    ).status,
  ).toBe("review_required");
  await page.getByRole("button", { name: "Refresh payment records" }).click();
  await expect(page.getByTestId("available-balance")).toContainText("0.00");
});

test("refund requests enter the admin review queue without fabricating a refund", async ({
  page,
  request,
}, info) => {
  await session(page, "rider");
  await page.goto("/rider/wallet");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page.getByRole("button", { name: /TEST digital destination/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Request type").selectOption("refund");
  await dialog
    .getByLabel("Tell us what happened")
    .fill("TEST ONLY: please review the duplicate payment.");
  await dialog.getByRole("button", { name: "Submit request" }).click();
  await expect(dialog).not.toBeVisible();
  const adminPage = await page.context().newPage();
  await session(adminPage, "admin");
  await adminPage.goto("/admin/finance");
  await adminPage
    .getByRole("button", { name: "Requests", exact: true })
    .click();
  await expect(
    adminPage.getByText("TEST ONLY: please review the duplicate payment."),
  ).toBeVisible();
  await adminPage.getByRole("button", { name: "Review case" }).click();
  expect(
    await adminPage
      .getByRole("option", { name: "Closed", exact: true })
      .evaluate((option) => (option as HTMLOptionElement).disabled),
  ).toBe(true);
  await adminPage
    .getByLabel("Review notes")
    .fill("TEST ONLY: waiting for verified provider reconciliation.");
  await adminPage.getByRole("button", { name: "Save review" }).click();
  await expect(
    adminPage.getByText("Under review", { exact: true }),
  ).toBeVisible();
  expect(
    await (await request.get("http://127.0.0.1:54391/__test/counts")).json(),
  ).toEqual({ journals: 0, settlements: 0 });
  await adminPage.screenshot({
    path: info.outputPath("admin-finance.png"),
    fullPage: true,
  });
});

test("cash commission is netted once from verified digital earnings", async ({
  page,
  request,
}) => {
  const cash = await request.post("/api/biloo-pay/cash", {
    headers: {
      Authorization: "Bearer " + token("driver"),
      "Idempotency-Key": "isolated_cash_receipt_001",
    },
    data: { rideRequestId: ids.cash, cashReceived: true },
  });
  expect(cash.ok()).toBe(true);
  const ref = await initialize(request);
  expect((await webhook(request, ref)).ok()).toBe(true);
  await session(page, "driver");
  await page.goto("/driver/wallet");
  await expect(page.getByTestId("available-balance")).toContainText("140.00");
  await expect(
    page.locator(".bp-metric").filter({ hasText: "Cash commission due" }),
  ).toContainText("0.00");
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await expect(
    page.getByText("Cash commission offset: 20.00 ETB"),
  ).toBeVisible();
});

test("the API denies Rider access to Driver cash confirmation and administrator finance", async ({
  request,
}) => {
  const headers = {
    Authorization: "Bearer " + token("rider"),
    "Idempotency-Key": "isolated_invalid_role_001",
  };
  expect(
    (
      await request.post("/api/biloo-pay/cash", {
        headers,
        data: { rideRequestId: ids.cash, cashReceived: true },
      })
    ).status(),
  ).toBe(403);
  expect((await request.get("/api/admin/finance", { headers })).status()).toBe(
    403,
  );
  expect(
    await (await request.get("http://127.0.0.1:54391/__test/counts")).json(),
  ).toEqual({ journals: 0, settlements: 0 });
});

test("unavailable balances render as unknown and cannot be withdrawn", async ({
  page,
}) => {
  await session(page, "driver");
  await page.route("**/api/biloo-pay/snapshot", (route) =>
    route.fulfill({ status: 503, json: { status: "unavailable" } }),
  );
  await page.goto("/driver/wallet");
  await expect(
    page.getByRole("heading", { name: "Unable to load records" }),
  ).toBeVisible();
  await expect(page.getByTestId("available-balance")).toContainText("—");
  await expect(
    page.getByRole("button", { name: "Withdraw", exact: true }),
  ).toBeDisabled();
});

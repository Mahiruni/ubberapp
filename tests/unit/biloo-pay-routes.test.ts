vi.mock("../../lib/runtime-config", () => ({
  publicConfig: {
    supabaseUrl: "https://biloo-pay-test.supabase.co",
    supabaseKey: "local-test-only",
  },
}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  ready: vi.fn(),
  verify: vi.fn(),
  auth: vi.fn(),
  init: vi.fn(),
}));
vi.mock("../../lib/nexride-server-admin", () => ({
  serverAdminSupabase: () => ({ rpc: mock.rpc }),
}));
vi.mock("../../lib/nexride-server-supabase", () => ({
  authorizedRequestSupabase: mock.auth,
}));
vi.mock("../../lib/nexride-payments", async () => {
  const original = await vi.importActual<
    typeof import("../../lib/nexride-payments")
  >("../../lib/nexride-payments");
  return {
    ...original,
    paymentConfiguration: () => ({
      enabled: true,
      provider: "chapa",
      mode: "test",
    }),
    verifyChapaPayment: mock.verify,
    initializeChapaPayment: mock.init,
  };
});
import { GET as callback } from "../../app/api/payments/chapa/callback/route";
import { POST as webhook } from "../../app/api/payments/chapa/webhook/route";
import { POST as cash } from "../../app/api/biloo-pay/cash/route";
const ref = "biloo-10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BILOO_PAY_ENABLED", "true");
  vi.stubEnv("BILOO_PAY_VERIFIED_PROJECT_REF", "biloo-pay-test");
  vi.stubEnv("BILOO_PAY_PRODUCTION_PROJECT_REF", "production-fixture");
  vi.stubEnv("PAYMENT_MODE", "test");
  vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "test-webhook");
  mock.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "biloo_pay_capabilities_server"
        ? { schemaVersion: "20261026.1", writesEnabled: true, mode: "test" }
        : name === "biloo_pay_attempt_server"
          ? {
              id: "attempt",
              amount_minor: 10000,
              tx_ref: ref,
              mode: "test",
              status: "pending",
            }
          : {},
    error: null,
  }));
  mock.verify.mockResolvedValue({ verified: false, evidence: null });
});
afterEach(() => vi.unstubAllEnvs());
function signed(event: Record<string, unknown>) {
  const raw = JSON.stringify(event),
    signature = createHmac("sha256", "test-webhook").update(raw).digest("hex");
  return new Request("https://biloo.test/api/payments/chapa/webhook", {
    method: "POST",
    headers: { "x-chapa-signature": signature },
    body: raw,
  });
}
describe("Payment API state transitions", () => {
  it("never marks a pending payment failed because a callback could not verify it", async () => {
    const response = await callback(
      new Request(
        "https://biloo.test/api/payments/chapa/callback?tx_ref=" +
          ref +
          "&status=success",
      ),
    );
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "verification_pending" });
    expect(
      mock.rpc.mock.calls.some(([name]) => /settle|fail|update/.test(name)),
    ).toBe(false);
  });
  it("rejects unsigned webhooks before touching the database", async () => {
    expect(
      (
        await webhook(
          new Request("https://biloo.test/hook", {
            method: "POST",
            body: JSON.stringify({ tx_ref: ref, event: "charge.success" }),
          }),
        )
      ).status,
    ).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requests provider retries when verification is unavailable", async () => {
    const response = await webhook(
      signed({
        tx_ref: ref,
        event: "charge.success",
        mode: "test",
        currency: "ETB",
      }),
    );
    expect(response.status).toBe(503);
    expect(mock.rpc).toHaveBeenCalledWith(
      "biloo_pay_record_webhook_server",
      expect.objectContaining({ p_state: "retry" }),
    );
    expect(
      mock.rpc.mock.calls.some(
        ([name]) => name === "biloo_pay_settle_chapa_server",
      ),
    ).toBe(false);
  });
  it("places a refund/reversal review instead of treating it as payment success", async () => {
    const response = await webhook(
      signed({
        tx_ref: ref,
        event: "charge.reversed",
        mode: "test",
        currency: "ETB",
      }),
    );
    expect(response.status).toBe(200);
    expect(mock.verify).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith(
      "biloo_pay_provider_review_server",
      expect.objectContaining({ p_event: "charge.reversed" }),
    );
  });
  it("does not hold a live payment because of an event from another mode", async () => {
    const response = await webhook(
      signed({
        tx_ref: ref,
        event: "charge.reversed",
        mode: "live",
        currency: "ETB",
      }),
    );
    expect(response.status).toBe(409);
    expect(
      mock.rpc.mock.calls.some(
        ([name]) => name === "biloo_pay_provider_review_server",
      ),
    ).toBe(false);
  });
  it("settles only after a server verification returns evidence", async () => {
    const evidence = {
      status: "success",
      amountMinor: 10000,
      currency: "ETB",
      mode: "test",
      txRef: ref,
      reference: "provider",
    };
    mock.verify.mockResolvedValue({ verified: true, evidence });
    expect(
      (
        await webhook(
          signed({
            tx_ref: ref,
            event: "charge.success",
            mode: "test",
            currency: "ETB",
          }),
        )
      ).status,
    ).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("biloo_pay_settle_chapa_server", {
      p_id: "attempt",
      p_evidence: evidence,
    });
  });
  it("does not acknowledge settlement when the database transaction fails", async () => {
    mock.verify.mockResolvedValue({ evidence: { reference: "provider" } });
    const original = mock.rpc.getMockImplementation()!;
    mock.rpc.mockImplementation(async (name: string, args: unknown) =>
      name === "biloo_pay_settle_chapa_server"
        ? { data: null, error: { message: "transaction failed" } }
        : original(name, args),
    );
    expect(
      (
        await webhook(
          signed({
            tx_ref: ref,
            event: "charge.success",
            mode: "test",
            currency: "ETB",
          }),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects cash confirmation without a verified signed-in user", async () => {
    mock.auth.mockResolvedValue(null);
    expect(
      (
        await cash(
          new Request("https://biloo.test/cash", {
            method: "POST",
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);
  });
});

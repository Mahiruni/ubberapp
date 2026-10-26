vi.mock("../../lib/runtime-config", () => ({
  publicConfig: {
    supabaseUrl: "https://biloo-pay-test.supabase.co",
    supabaseKey: "local-test-only",
  },
}));
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { etbDecimal, etbMinor } from "../../lib/biloo-pay-money";
import { bilooPayConfiguration } from "../../lib/biloo-pay-config";
import {
  chapaCheckoutUrl,
  paymentConfiguration,
  validChapaWebhookSignature,
  verifyChapaPayment,
} from "../../lib/nexride-payments";
import { verifyChapaPayout } from "../../lib/nexride-payouts";

beforeEach(() => {
  vi.stubEnv("BILOO_PAY_ENABLED", "true");
  vi.stubEnv("BILOO_PAY_VERIFIED_PROJECT_REF", "biloo-pay-test");
  vi.stubEnv("BILOO_PAY_PRODUCTION_PROJECT_REF", "production-fixture");
  vi.stubEnv("BILOO_PAY_PAYOUTS_REVIEWED", "true");
  vi.stubEnv("PAYMENT_MODE", "test");
  vi.stubEnv("PAYMENT_PROVIDER", "chapa");
  vi.stubEnv("NEXRIDE_PAYMENTS_ENABLED", "true");
  vi.stubEnv("NEXRIDE_PAYOUTS_ENABLED", "true");
  vi.stubEnv("PAYMENT_SECRET_KEY", "test-only-no-provider-access");
  vi.stubEnv("PAYMENT_WEBHOOK_SECRET", "local-test-only-webhook-secret");
  vi.stubEnv("PAYOUT_ENCRYPTION_KEY", "local-test-only-encryption-material");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Biloo money parsing", () => {
  it.each([
    ["0", 0],
    ["0.01", 1],
    ["1.1", 110],
    ["9999999999.99", 999999999999],
  ])("converts %s without rounding", (value, expected) => {
    expect(etbMinor(value)).toBe(expected);
    expect(etbMinor(etbDecimal(expected as number))).toBe(expected);
  });
  it.each([
    null,
    undefined,
    "",
    "-1",
    "1e3",
    "0.001",
    "1.999",
    "Infinity",
    "12,000",
    0.1 + 0.2,
    "10000000000",
    {},
    true,
  ])("rejects invalid or ambiguous money %s", (value) => {
    expect(etbMinor(value)).toBeNull();
  });
});
describe("Release and provider security boundaries", () => {
  it.each([undefined, "", "   "])("keeps payments disabled without a designated production project: %s", value => {
    vi.stubEnv("BILOO_PAY_PRODUCTION_PROJECT_REF", value);
    expect(paymentConfiguration().enabled).toBe(false);
    vi.stubEnv("PAYMENT_MODE", "live");
    expect(paymentConfiguration().enabled).toBe(false);
  });
  it("requires a verified project and refuses live operations from a preview", () => {
    expect(bilooPayConfiguration().enabled).toBe(true);
    vi.stubEnv("BILOO_PAY_VERIFIED_PROJECT_REF", "ocvydmfywynqacshmcey");
    expect(paymentConfiguration().enabled).toBe(false);
    vi.stubEnv("BILOO_PAY_VERIFIED_PROJECT_REF", "biloo-pay-test");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("PAYMENT_MODE", "live");
    expect(paymentConfiguration().enabled).toBe(false);
  });
  it("never permits test transactions in the designated production database", () => {
    vi.stubEnv("BILOO_PAY_PRODUCTION_PROJECT_REF", "biloo-pay-test");
    expect(bilooPayConfiguration().enabled).toBe(false);
    vi.stubEnv("PAYMENT_MODE", "live");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(bilooPayConfiguration().enabled).toBe(true);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(bilooPayConfiguration().enabled).toBe(false);
  });
  it.each([
    "https://evil.test",
    "https://checkout.chapa.co.evil.test",
    "http://checkout.chapa.co",
    "https://user:pw@checkout.chapa.co",
    "https://checkout.chapa.co:444/x",
  ])("rejects an unsafe checkout %s", (url) => {
    expect(chapaCheckoutUrl(url)).toBeNull();
  });
  it("checks the exact signed body with constant-time comparison", () => {
    const raw = '{ "event": "charge.success" }';
    const signature = createHmac("sha256", process.env.PAYMENT_WEBHOOK_SECRET!)
      .update(raw)
      .digest("hex");
    expect(validChapaWebhookSignature(raw, signature)).toBe(true);
    expect(
      validChapaWebhookSignature(JSON.stringify(JSON.parse(raw)), signature),
    ).toBe(false);
    expect(validChapaWebhookSignature(raw, null)).toBe(false);
    expect(validChapaWebhookSignature(raw, "x".repeat(64))).toBe(false);
  });
  it("never verifies a payment with a wrong amount, mode, currency or reference", async () => {
    for (const mismatch of [
      { amount: "99.99" },
      { mode: "live" },
      { currency: "USD" },
      { tx_ref: "another" },
      { reference: null },
      { status: "pending" },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json({
              status: "success",
              data: {
                status: "success",
                amount: "100.00",
                mode: "test",
                currency: "ETB",
                tx_ref: "ref",
                reference: "provider-reference",
                ...mismatch,
              },
            }),
          ),
      );
      expect(
        (await verifyChapaPayment({ txRef: "ref", amount: 100 })).verified,
      ).toBe(false);
    }
  });
  it("returns only normalized verification evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            status: "success",
            data: {
              status: "success",
              amount: "100.00",
              mode: "test",
              currency: "ETB",
              tx_ref: "ref",
              reference: "provider-reference",
              email: "private@example.test",
            },
          }),
        ),
    );
    const result = await verifyChapaPayment({ txRef: "ref", amount: 100 });
    expect(result.evidence).toEqual({
      status: "success",
      amountMinor: 10000,
      currency: "ETB",
      mode: "test",
      txRef: "ref",
      reference: "provider-reference",
    });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
  });
  it("does not accept an unmatched payout even if its status says success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({
            status: "success",
            data: {
              status: "success",
              amount: "100.00",
              mode: "test",
              currency: "ETB",
              reference: "ref",
              bank_code: "2",
              account_number: "123456",
            },
          }),
        ),
    );
    expect(
      (
        await verifyChapaPayout("ref", {
          amountMinor: 10000,
          mode: "test",
          bankCode: "1",
          accountNumber: "123456",
        })
      ).state,
    ).toBe("processing");
  });
  it("keeps a missing/unknown provider payout reserved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({}, { status: 404 })),
    );
    const result = await verifyChapaPayout("ref", {
      amountMinor: 10000,
      mode: "test",
      bankCode: "1",
      accountNumber: "123456",
    });
    expect(result.state).toBe("not_found");
    expect(result.evidence).toBeUndefined();
  });
});

import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  initializeChapaPayment,
  paymentConfiguration,
  validChapaWebhookSignature,
  verifyChapaPayment,
} from "../../lib/nexride-payments";
import {
  initiateChapaPayout,
  listChapaPayoutBanks,
  verifyChapaPayout,
} from "../../lib/nexride-payouts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sandbox() {
  vi.stubEnv("PAYMENT_PROVIDER", "chapa");
  vi.stubEnv("NEXRIDE_PAYMENTS_ENABLED", "true");
  vi.stubEnv("NEXRIDE_PAYOUTS_ENABLED", "true");
  vi.stubEnv("CHAPA_SECRET_KEY", "CHAPA_TEST_sample-key");
  vi.stubEnv("CHAPA_WEBHOOK_SECRET", "biloo-long-test-signing-secret");
  vi.stubEnv("PAYOUT_ENCRYPTION_KEY", "biloo-test-encryption-key-with-sufficient-length");
}

describe("Biloo Chapa v2 payment safety", () => {
  it("remains disabled without merchant approval for live charges", () => {
    sandbox();
    expect(paymentConfiguration().enabled).toBe(true);
    vi.stubEnv("CHAPA_SECRET_KEY", "CHAPA_LIVE_sample");
    expect(paymentConfiguration().enabled).toBe(false);
    vi.stubEnv("BILOO_LIVE_PAYMENTS_APPROVED", "true");
    expect(paymentConfiguration().mode).toBe("live");
  });

  it("validates HMAC on the exact raw request body", () => {
    sandbox();
    const raw = '{"event":"payment.success","amount":"100"}';
    const signature = createHmac("sha256", "biloo-long-test-signing-secret")
      .update(raw).digest("hex");
    expect(validChapaWebhookSignature(raw, signature)).toBe(true);
    expect(validChapaWebhookSignature(raw + " ", signature)).toBe(false);
  });

  it("initializes hosted ETB checkout with merchant reference and no exposed keys", async () => {
    sandbox();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      data: { checkout_url: "https://checkout.chapa.co/payment/CHREF1234" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await initializeChapaPayment({
      txRef: "biloo-ride-1234",
      amount: 125.5,
      email: "rider@example.com",
      firstName: "Biloo",
      returnUrl: "https://example.com/return",
      callbackUrl: "https://example.com/callback",
    });
    expect(res.checkoutUrl).toContain("checkout.chapa.co");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.chapa.global/v2/payments/hosted");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.merchant_reference).toBe("biloo-ride-1234");
    expect(body.currency).toBe("ETB");
    expect(body.customer.email).toBe("rider@example.com");
  });

  it("only confirms a payment when Chapa and merchant references, amount and currency match", async () => {
    sandbox();
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      data: {
        chapa_reference: "CHREF1234",
        merchant_reference: "biloo-ride-1234",
        amount: 125.5,
        currency: "ETB",
        status: "success",
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mock);
    const result = await verifyChapaPayment({
      txRef: "biloo-ride-1234", chapaReference: "CHREF1234", amount: 125.5,
    });
    expect(result.verified).toBe(true);
    const incorrect = await verifyChapaPayment({
      txRef: "another-ride", chapaReference: "CHREF1234", amount: 125.5,
    });
    expect(incorrect.verified).toBe(false);
    expect(incorrect.state).toBe("unverified");
  });

  it("does not equate a missing Chapa reference with payment failure", async () => {
    sandbox();
    const r = await verifyChapaPayment({ txRef: "biloo-ref", amount: 10 });
    expect(r.state).toBe("unverified");
    expect(r.verified).toBe(false);
  });
});

describe("Biloo Chapa v2 payout contract", () => {
  it("finds active Ethiopian ETB destinations", async () => {
    sandbox();
    const bank = {
      bank_name: "Commercial Bank of Ethiopia", bank_slug: "cbe", is_active: true,
      supported_currencies: { ETB: { countries: { ET: { is_enabled: true } } } },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "success", data: { items: [bank] } }), { status: 200 }),
    ));
    expect(await listChapaPayoutBanks()).toEqual([{ code: "cbe", name: "Commercial Bank of Ethiopia" }]);
  });

  it("initializes payouts using a bank_slug and provider idempotency key", async () => {
    sandbox();
    const mocked = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success", data: { status: "processing" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", mocked);
    await initiateChapaPayout({
      reference: "biloo-payout-1234", amount: 10,
      bankCode: "cbe", accountName: "Example Driver", accountNumber: "1001234567890",
    });
    expect(mocked.mock.calls[0][0]).toBe("https://api.chapa.global/v2/payouts");
    const req = mocked.mock.calls[0][1];
    expect(req.headers["Idempotency-Key"]).toBe("biloo-payout-1234");
    expect(JSON.parse(req.body).account.bank_slug).toBe("cbe");
  });

  it("rejects a payout verification with the wrong amount", async () => {
    sandbox();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "success",
      data: {
        merchant_reference: "biloo-payout-1234",
        chapa_reference: "CHREF1234",
        status: "completed",
        amount: 999, currency: "ETB",
      },
    }), { status: 200 })));
    await expect(verifyChapaPayout("CHREF1234", 100, "biloo-payout-1234"))
      .rejects.toThrow("PAYOUT_VERIFICATION_MISMATCH");
  });
});

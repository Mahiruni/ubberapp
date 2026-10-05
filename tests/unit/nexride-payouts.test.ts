import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decryptPayoutAccountNumber,
  encryptPayoutAccountNumber,
  maskPayoutAccountNumber,
  normalizePayoutAccountNumber,
  payoutConfiguration,
} from "../../lib/nexride-payouts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("driver payout security helpers", () => {
  it("keeps payouts disabled until every server-side requirement is present", () => {
    vi.stubEnv("NEXRIDE_PAYOUTS_ENABLED", "true");
    vi.stubEnv("PAYMENT_PROVIDER", "chapa");
    vi.stubEnv("PAYMENT_SECRET_KEY", "secret-key");
    vi.stubEnv("PAYOUT_ENCRYPTION_KEY", "");
    expect(payoutConfiguration()).toEqual({ enabled: false, provider: null });

    vi.stubEnv(
      "PAYOUT_ENCRYPTION_KEY",
      "a-long-server-only-encryption-key-for-tests",
    );
    expect(payoutConfiguration()).toEqual({
      enabled: true,
      provider: "chapa",
    });
  });

  it("normalizes, masks and encrypts payout account numbers without plaintext leakage", () => {
    vi.stubEnv(
      "PAYOUT_ENCRYPTION_KEY",
      "another-long-server-only-encryption-key-for-tests",
    );
    const account = normalizePayoutAccountNumber(" 251-911 223 344 ");
    expect(account).toBe("251911223344");
    expect(maskPayoutAccountNumber(account)).toBe("•••• 3344");

    const encrypted = encryptPayoutAccountNumber(account);
    expect(encrypted).not.toContain(account);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptPayoutAccountNumber(encrypted)).toBe(account);
  });

  it("rejects malformed account numbers before they reach the provider", () => {
    expect(normalizePayoutAccountNumber("")).toBe("");
    expect(normalizePayoutAccountNumber("account-ABC")).toBe("");
    expect(normalizePayoutAccountNumber("1234")).toBe("");
  });
});

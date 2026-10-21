import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  paymentMethods, isBilooMethod, isChargeableMethod,
  paymentMethodName, tripPaymentLabel, formatEtb,
} from "../../lib/biloo-payment-preferences";

describe("Biloo rider financial experience before provider activation", () => {
  it("only allows cash as an active payment method", () => {
    expect(paymentMethods.filter(item => item.available).map(item => item.id)).toEqual(["cash"]);
    for (const method of paymentMethods) {
      expect(isChargeableMethod(method.id)).toBe(method.id === "cash");
    }
  });
  it("accepts only supported preference identifiers", () => {
    expect(isBilooMethod("telebirr")).toBe(true);
    expect(isBilooMethod("cbe_birr")).toBe(true);
    expect(isBilooMethod("mpesa")).toBe(true);
    expect(isBilooMethod("invalid")).toBe(false);
    expect(isBilooMethod({id:"cash"})).toBe(false);
    expect(paymentMethodName("not_real")).toBe("Unknown payment method");
  });
  it("never mislabels pending, unknown, or failed rides as paid", () => {
    expect(tripPaymentLabel("paid", true)).toBe("Recorded as paid");
    expect(tripPaymentLabel("pending", true)).toBe("Payment pending");
    expect(tripPaymentLabel("pending", false)).toBe("Trip in progress");
    expect(tripPaymentLabel("unknown", true)).toBe("Payment status unconfirmed");
    expect(tripPaymentLabel("failed", true)).toBe("Payment failed");
  });
  it("treats missing estimates as unconfirmed, not zero or wallet balance", () => {
    expect(formatEtb(null)).toBe("Not confirmed");
    expect(formatEtb("bad value")).toBe("Not confirmed");
    expect(formatEtb(-500)).toBe("Not confirmed");
    expect(formatEtb(120)).toContain("120.00");
  });
  it("renders actual Supabase records without checkout or stored banking secrets", () => {
    const source = readFileSync("app/rider/wallet/page.tsx", "utf8");
    expect(source).toContain('.from("ride_requests")');
    expect(source).toContain('.from("payment_transactions")');
    expect(source).toContain('.from("rider_payment_preferences")');
    expect(source).not.toContain("/api/payments/chapa/initialize");
    expect(source).not.toContain("paymentConfiguration()");
    expect(source).not.toContain("PAYMENT_SECRET_KEY");
  });
});

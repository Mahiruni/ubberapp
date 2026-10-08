import { describe, expect, it } from "vitest";
import { normalizeEthiopianPhone, identityDocumentReusable } from "../../lib/nexride-identity";
describe("NexRide Ethiopian identity normalization", () => {
  it("treats Ethiopian local, national and international phone formats identically", () => {
    expect(normalizeEthiopianPhone("0912345678")).toBe("+251912345678");
    expect(normalizeEthiopianPhone("+251 912 345 678")).toBe("+251912345678");
    expect(normalizeEthiopianPhone("251-912-345-678")).toBe("+251912345678");
    expect(normalizeEthiopianPhone("912345678")).toBe("+251912345678");
    expect(normalizeEthiopianPhone("0712345678")).toBe("+251712345678");
  });
  it("rejects malformed or unsupported phone identifiers", () => {
    expect(normalizeEthiopianPhone("")).toBeNull();
    expect(normalizeEthiopianPhone("12345")).toBeNull();
    expect(normalizeEthiopianPhone("+15551234567")).toBeNull();
    expect(normalizeEthiopianPhone("+251112345678")).toBeNull();
  });
  it("reuses approved/pending documents instead of repeatedly asking to upload", () => {
    expect(identityDocumentReusable("approved")).toBe(true);
    expect(identityDocumentReusable("pending")).toBe(true);
    expect(identityDocumentReusable("rejected")).toBe(false);
    expect(identityDocumentReusable("expired")).toBe(false);
  });
});

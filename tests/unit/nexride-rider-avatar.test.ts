import { describe, expect, it } from "vitest";
import {
  RIDER_AVATAR_MAX_BYTES,
  riderAvatarValidation,
} from "../../lib/nexride-rider-avatar";

describe("NexRide Rider avatar upload validation", () => {
  it("accepts common images within a private bucket's 25 MB source limit, before compression", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(riderAvatarValidation({ type, size: RIDER_AVATAR_MAX_BYTES })).toBeNull();
    }
  });
  it("rejects invalid images and executable or document types", () => {
    expect(riderAvatarValidation({ type: "image/svg+xml", size: 1000 })).toBe("type");
    expect(riderAvatarValidation({ type: "application/pdf", size: 1000 })).toBe("type");
    expect(riderAvatarValidation({ type: "image/gif", size: 1000 })).toBe("type");
    expect(riderAvatarValidation({ type: "", size: 1000 })).toBe("type");
  });
  it("rejects empty, oversized or malformed files", () => {
    expect(riderAvatarValidation({ type: "image/png", size: 0 })).toBe("size");
    expect(riderAvatarValidation({ type: "image/png", size: RIDER_AVATAR_MAX_BYTES + 1 })).toBe("size");
    expect(riderAvatarValidation({ type: "image/png", size: Number.NaN })).toBe("size");
  });
});

import { describe, expect, it } from "vitest";
import { riderAccessAllowed } from "../../lib/nexride-rider-eligibility";
import { authErrorKey } from "../../lib/nexride-auth-errors";

describe("NexRide unified-role Rider permissions", () => {
  it("keeps existing active Riders usable", () => {
    expect(riderAccessAllowed("rider", "active", false)).toBe(true);
  });
  it("allows a Rider role explicitly activated on an offline Driver identity", () => {
    expect(riderAccessAllowed("driver", "active", true, false, false)).toBe(true);
  });
  it("rejects booking by Online or busy Drivers", () => {
    expect(riderAccessAllowed("driver", "active", true, true, false)).toBe(false);
    expect(riderAccessAllowed("driver", "active", true, false, true)).toBe(false);
  });
  it("never grants Rider access solely from a Driver primary role", () => {
    expect(riderAccessAllowed("driver", "active", false)).toBe(false);
  });
  it("rejects suspended identities even with both role memberships", () => {
    expect(riderAccessAllowed("driver", "suspended", true)).toBe(false);
    expect(riderAccessAllowed("rider", "suspended", true)).toBe(false);
  });
  it("preserves existing authorized Admin behavior without giving unknown roles access", () => {
    expect(riderAccessAllowed("admin", "active", false)).toBe(true);
    expect(riderAccessAllowed("unknown", "active", true)).toBe(false);
  });
});

describe("NexRide account recognition privacy", () => {
  it("does not disclose registered email existence during public signup", () => {
    expect(authErrorKey({ message: "User already registered" }, "signup"))
      .toBe("createAccountFailure");
    expect(authErrorKey({ message: "User already exists" }, "signup"))
      .toBe("createAccountFailure");
  });
  it("reports invalid credentials without creating or recognizing an account", () => {
    expect(authErrorKey({ message: "Invalid login credentials" }, "signin"))
      .toBe("authInvalidCredentials");
  });
});

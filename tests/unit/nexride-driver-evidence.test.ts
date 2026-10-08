import { describe, expect, it } from "vitest";
import { unsubmittedDriverEvidencePaths, sanitizeDriverVerificationDraft } from "../../lib/nexride-driver-evidence";
describe("NexRide identity evidence cleanup", () => {
  it("preserves approved and previously submitted verification paths", () => {
    const existing = ["user/license-approved.pdf", "user/vehicle-approved.png"];
    expect(unsubmittedDriverEvidencePaths([
      existing[0], "user/new-license.pdf", "user/new-license.pdf", "",
    ],existing)).toEqual(["user/new-license.pdf"]);
  });
  it("removes only newly uploaded evidence after a rejected or lost response", () => {
    expect(unsubmittedDriverEvidencePaths(["user/vehicle-new.png"],[
      "user/vehicle-existing.png",
    ])).toEqual(["user/vehicle-new.png"]);
  });
  it("does not delete existing documents on retry with no new uploads", () => {
    expect(unsubmittedDriverEvidencePaths([],["user/license-existing.pdf"])).toEqual([]);
  });
});

describe("Private Driver license number draft migration", () => {
  it("scrubs a legacy license number and retains only non-sensitive vehicle fields", () => {
    const draft = sanitizeDriverVerificationDraft(JSON.stringify({
      licenseNumber: "SENSITIVE-NUMBER",
      licenseExpiry: "2027-10-01",
      vehicle: "Toyota",
      vehicleColor: "White",
      plate: "A123",
      accountToken: "SHOULD-NOT-PERSIST",
    }));
    expect(draft).not.toContain("SENSITIVE-NUMBER");
    expect(draft).not.toContain("SHOULD-NOT-PERSIST");
    expect(JSON.parse(draft)).toEqual({
      licenseExpiry:"2027-10-01",vehicle:"Toyota",vehicleColor:"White",plate:"A123",
    });
  });
  it("does not carry arbitrary fields from a malformed legacy object", () => {
    expect(JSON.parse(sanitizeDriverVerificationDraft('{"licenseNumber":"ABC"}')))
      .toEqual({licenseExpiry:"",vehicle:"",vehicleColor:"",plate:""});
    expect(() => sanitizeDriverVerificationDraft("{not-json")).toThrow();
  });
});

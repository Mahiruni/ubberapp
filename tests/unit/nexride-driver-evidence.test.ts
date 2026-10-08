import { describe, expect, it } from "vitest";
import { unsubmittedDriverEvidencePaths } from "../../lib/nexride-driver-evidence";
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

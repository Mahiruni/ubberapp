import { describe, expect, it } from "vitest";
import {identityActivityLabel} from "../../lib/nexride-identity-events";
describe("Private identity history labels",()=>{
 it("uses non-sensitive status labels",()=>{
  expect(identityActivityLabel("document_submitted")).toBe("Identity document submitted");
  expect(identityActivityLabel("phone_changed")).toBe("Verified phone changed");
  expect(identityActivityLabel("deletion_requested")).toBe("Account deletion review requested");
 });
 it("supports Amharic and ignores unknown events",()=>{
  expect(identityActivityLabel("phone_verified","am")).toContain("ስልክ");
  expect(identityActivityLabel("phone_verified: +251912345678")).toBe("Account activity");
 });
});

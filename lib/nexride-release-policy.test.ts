import { describe, expect, it } from "vitest";
import {
  isAcceptedNexRideNativeRelease,
  NEXRIDE_ANDROID_RELEASE_ID,
  NEXRIDE_MIN_ANDROID_VERSION_CODE,
} from "./nexride-release-policy";

describe("NexRide Android native release compatibility", () => {
  const current = {
    releaseId: NEXRIDE_ANDROID_RELEASE_ID,
    versionCode: NEXRIDE_MIN_ANDROID_VERSION_CODE,
    packageName: "com.nexride.rider",
    role: "rider",
  };
  it("accepts only registered Rider and Driver release identities", () => {
    expect(isAcceptedNexRideNativeRelease(current)).toBe(true);
    expect(isAcceptedNexRideNativeRelease({
      ...current, packageName: "com.nexride.driver", role: "driver",
    })).toBe(true);
  });
  it("rejects older or unidentified APKs", () => {
    expect(isAcceptedNexRideNativeRelease(null)).toBe(false);
    expect(isAcceptedNexRideNativeRelease({ ...current, versionCode: 1 })).toBe(false);
    expect(isAcceptedNexRideNativeRelease({ ...current, releaseId: "legacy" })).toBe(false);
    expect(isAcceptedNexRideNativeRelease({ ...current, packageName: "fake.nexride.rider" })).toBe(false);
    expect(isAcceptedNexRideNativeRelease({ ...current, versionCode: Number.NaN })).toBe(false);
    expect(isAcceptedNexRideNativeRelease({ ...current, role: "driver" })).toBe(false);
  });
});

/**
 * Native Android release compatibility policy.
 * This is a user-facing retirement gate for original app wrappers.
 * Do not treat a JavaScript release identifier as backend authorization or attestation.
 */
export const NEXRIDE_MIN_ANDROID_VERSION_CODE = 20261014;
export const NEXRIDE_ANDROID_RELEASE_ID = "nexride-2026-10-14-02";

export type NexRideNativeReleaseIdentity = {
  releaseId: string;
  versionCode: number;
  packageName: string;
  role: string;
};

export function isAcceptedNexRideNativeRelease(
  identity: NexRideNativeReleaseIdentity | null | undefined,
): boolean {
  if (!identity || identity.releaseId !== NEXRIDE_ANDROID_RELEASE_ID ||
    !Number.isInteger(identity.versionCode) ||
    identity.versionCode < NEXRIDE_MIN_ANDROID_VERSION_CODE) return false;
  return (identity.role === "rider" && identity.packageName === "com.nexride.rider") ||
    (identity.role === "driver" && identity.packageName === "com.nexride.driver");
}

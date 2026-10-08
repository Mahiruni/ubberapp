/**
 * Public app compatibility contract. Web deployments and Android binary updates
 * are intentionally different: an ordinary Vercel push must not force an APK install.
 */
export type MobileRole = "rider" | "driver";
export type MobileRelease = {
  role: MobileRole;
  platform: "android";
  webRevision: string;
  minimumBuild: number;
  latestBuild: number;
  storeUrl: string;
};
export type ReleaseDecision = "current" | "native-update" | "web-refresh";

export function nativeRoleFromPackage(packageId: string): MobileRole | null {
  if (packageId === "com.nexride.rider") return "rider";
  if (packageId === "com.nexride.driver") return "driver";
  return null;
}

export function validBuild(value: unknown): number | null {
  const num = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof num === "number" && Number.isSafeInteger(num) && num >= 1 ? num : null;
}

export function parseMobileRelease(data: unknown, role: MobileRole): MobileRelease | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const v = data as Record<string, unknown>;
  const minimumBuild = validBuild(v.minimumBuild);
  const latestBuild = validBuild(v.latestBuild);
  if (v.role !== role || v.platform !== "android" || minimumBuild == null || latestBuild == null || latestBuild < minimumBuild) return null;
  const expectedStoreUrl = "https://play.google.com/store/apps/details?id=com.nexride." + role;
  if (v.storeUrl !== expectedStoreUrl || typeof v.webRevision !== "string" || !/^[a-zA-Z0-9._-]{1,120}$/.test(v.webRevision)) return null;
  return { role, platform: "android", minimumBuild, latestBuild, storeUrl: expectedStoreUrl, webRevision: v.webRevision };
}

export function decideMobileRelease(release: MobileRelease, installedBuild: number, previousWebRevision: string | null): ReleaseDecision {
  if (installedBuild < release.minimumBuild) return "native-update";
  if (previousWebRevision && previousWebRevision !== release.webRevision) return "web-refresh";
  return "current";
}

import { NextRequest, NextResponse } from "next/server";
import { validBuild, type MobileRole } from "../../../../lib/nexride-mobile-release";

export const dynamic = "force-dynamic";

/**
 * Public, no-cache release policy. Operators bump minimumBuild ONLY AFTER the
 * corresponding signed Android build is available to users in Google Play.
 * A website-only Vercel deployment changes webRevision, not minimumBuild.
 */
export function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  if (role !== "rider" && role !== "driver") {
    return NextResponse.json({ error: "Unknown app role" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const name = (role as MobileRole).toUpperCase();
  const minimumBuild = validBuild(process.env["NEXRIDE_" + name + "_MIN_ANDROID_BUILD"]) ?? 1;
  const latestBuild = Math.max(minimumBuild, validBuild(process.env["NEXRIDE_" + name + "_LATEST_ANDROID_BUILD"]) ?? 1);
  const rawRevision = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXRIDE_WEB_REVISION || "web-initial";
  const webRevision = /^[a-zA-Z0-9._-]{1,120}$/.test(rawRevision) ? rawRevision : "web-initial";
  return NextResponse.json({
    role, platform: "android", webRevision, minimumBuild, latestBuild,
    storeUrl: "https://play.google.com/store/apps/details?id=com.nexride." + role,
  }, { headers: { "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff" } });
}

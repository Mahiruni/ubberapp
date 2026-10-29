import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verificationSummary, type DriverProfileData } from "../../lib/nexride-driver-profile";

const source = (path: string) => readFileSync(join(process.cwd(),path),"utf8");

const driver = (partial: Partial<DriverProfileData> = {}): DriverProfileData => ({
  id: "22222222-2222-4222-8222-222222222222",
  fullName: "Test Driver", phone: "", email: "", avatarUrl: "",
  role: "driver", accountStatus: "active", rating: null, completedTrips: null,
  vehicle: "", vehicleColor: "", vehiclePlate: "",
  licenseNumber: "", licenseExpiry: "", licenseDocumentPath: "",
  vehicleRegistrationPath: "", reviewStatus: "draft", rejectionReason: "",
  submittedAt: "", reviewedAt: "", ...partial
});

describe("Biloo premium Account experience", () => {
  it("uses genuinely authorized navigation and the live account backends", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    const driverSettings = source("app/driver/profile/settings/page.tsx");
    expect(rider).toContain("readAccount()");
    expect(rider).toContain("saveAccount(account,form)");
    expect(rider).toContain("signOutNexRide('rider')");
    expect(driverScreen).toContain("loadDriverProfileData(driverId)");
    expect(driverScreen).toContain('router.push("/driver/profile/payouts")');
    expect(driverScreen).toContain('router.push("/driver/profile/documents")');
    expect(driverScreen).toContain('router.push("/account/manage?role=driver#account-security")');
    expect(driverScreen).toContain('signOutNexRide("driver")');
    expect(driverSettings).toContain("supabase.auth.getUser()");
    expect(driverSettings).toContain("identity.data.user?.id !== profile.id");
    expect(driverSettings).toContain('router.push("/driver/profile")');
  });

  it("does not fabricate wallet balances, rides or verification statuses", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    expect(rider).not.toMatch(/fakeBalance|sampleRides|mockRating/);
    expect(driverScreen).toContain('profile.rating === null ? "—"');
    expect(driverScreen).toContain('profile.completedTrips === null ? "—"');
    expect(driverScreen).toContain("verificationSummary(profile)");
  });

  it("keeps account management unique while leaving journey records in their own destinations", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driverScreen = source("components/nexride/driver-profile.tsx");
    const registry = source("lib/biloo-navigation-registry.ts");
    expect(rider).toContain("saveAccount(account,form)");
    expect(rider).toContain("title={say('Account & security'");
    expect(rider).not.toContain('className="biloo-rider-account-overview"');
    expect(rider).not.toContain("onClick={props.rides}");
    expect(rider).not.toContain("onClick={props.saved}");
    expect(rider).not.toContain("onClick={props.payments}");
    expect(driverScreen).toContain('router.push("/driver/profile/payouts")');
    expect(driverScreen).not.toContain('title={say("Trip activity")}');
    expect(driverScreen).not.toContain('title={say("Earnings report")}');
    expect(registry).toContain('id:"trips"');
    expect(registry).toContain('id:"earnings"');
  });

  it("removes expired-license verified status without altering database approvals", () => {
    const expired = driver({reviewStatus:"approved", licenseDocumentPath:"private/license.pdf", licenseExpiry:"2020-01-01"});
    const result = verificationSummary(expired);
    expect(result.tone).not.toBe("approved");
    expect(result.title).toMatch(/expired/i);
    const valid = driver({reviewStatus:"approved", licenseDocumentPath:"private/license.pdf", licenseExpiry:"2099-01-01"});
    expect(verificationSummary(valid).tone).toBe("approved");
    const pending = driver({reviewStatus:"pending"});
    expect(verificationSummary(pending).title).toMatch(/review/i);
    const vehicle = source("app/driver/profile/vehicle/page.tsx");
    const payouts = source("app/driver/profile/payouts/page.tsx");
    expect(vehicle).toContain('documentStatus(profile, "license") === "Expired"');
    expect(vehicle).toContain('licenseExpired ? say("Expired")');
    expect(payouts).toContain('verificationSummary(profile).tone !== "approved"');
  });

  it("applies the approved Rider and Driver visual preview without mock account values", () => {
    const rider = source("components/nexride/rider-profile.tsx");
    const driver = source("components/nexride/driver-profile.tsx");
    const driverCss = source("components/nexride/driver-profile.module.css");
    const css = source("app/biloo-account-premium.css");
    expect(rider).toContain('className="biloo-account-protection-note"');
    expect(rider).toContain("All your personal essentials, beautifully organized.");
    expect(driver).toContain('data-driver-account=""');
    expect(driver).toContain('say("Your account")');
    expect(driver).toContain('profile.rating === null ? "—"');
    expect(driver).toContain('verification.tone');
    expect(driverCss).toContain("var(--driver-text-primary");
    expect(css).toContain("background:#0a294f!important");
    expect(css).toContain("counter(biloo-rider-section,decimal-leading-zero)");
    expect(css).toContain("counter(biloo-driver-section,decimal-leading-zero)");
    expect(css).toContain("@media(max-width:355px)");
    expect(css).toContain("prefers-reduced-motion:reduce");
  });

  it("loads shared light/dark styles and reserves space for the dock", () => {
    const css = source("app/biloo-account-premium.css");
    const layout = source("app/layout.tsx");
    expect(layout).toContain('import "./biloo-account-premium.css";');
    expect(css).toContain('.nr-account-standard');
    expect(css).toContain('.nr-driver-profile-v2');
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain('var(--biloo-account-ink)');
    expect(css).toContain('env(safe-area-inset-bottom,0px)');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.nr-driver-profile-subpage.nr-app .nr-profile-subhead');
    expect(css).toContain('display:flex!important;');
    expect(css).toContain('.nr-driver-profile-subpage .nr-profile-subhead>button');
    const shell = source("components/nexride/driver-app-shell.tsx");
    // Account subpages share the canonical shell back button after header consolidation.
    expect(shell).toContain('pathname.startsWith("/driver/profile/")');
    expect(shell).toContain('return "/driver/profile"');
    expect(css).not.toContain("mapboxgl-canvas");
  });
});

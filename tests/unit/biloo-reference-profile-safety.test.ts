import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const safety = read("app/safety/page.tsx");
const safetyStyles = read("app/biloo-reference-account-safety.css");
const rider = read("components/nexride/rider-profile.tsx");
const riderPhoto = read("components/nexride/rider-photo-editor.tsx");
const driver = read("app/driver/profile/settings/page.tsx");
const settings = read("components/nexride/settings-groups.tsx");
const dialog = read("components/nexride/ui.tsx");
const root = read("app/layout.tsx");

describe("Biloo original profile, safety and settings experience", () => {
  it("preserves real emergency options instead of simulating an emergency call", () => {
    expect(safety).toContain('className="nr-safety-actions biloo-safety-quick-actions"');
    expect(safety).toContain('title={op("Emergency call options")}');
    expect(safety).toContain('onClick={() => open("sos")}');
    expect(safety).toContain('onClick={() => open("share")}');
    expect(safety).toContain('onClick={() => open("report")}');
    expect(safety).toContain('onClick={() => open("help")}');
    expect(safety).toContain('href="tel:991"');
    expect(safety).toContain('href="tel:912"');
    expect(safety).toContain('href="tel:907"');
    expect(safety).toContain("Biloo has not placed a call automatically");
    expect(safety).toContain("NativeTripSharePanel");
    expect(safety).toContain("SafetyReport");
    expect(safetyStyles).toContain(".biloo-safety-quick-actions>.nr-safety-action:nth-child(3)");
    expect(safetyStyles).toContain("background:#f20745!important");
  });

  it("maintains the five safety information topics for both Rider and Driver", () => {
    for (const topic of ["Proactive safety support", "Driver verification", "Protecting your privacy",
      "Staying safe on every ride", "Accidents: steps to take"]) {
      expect(safety).toContain(topic);
    }
    expect(safety).toContain('role === "rider" ? <RiderMenu');
    expect(safety).toContain('<DriverStandaloneMenu');
    expect(safetyStyles).toContain(".biloo-safety-protection-grid");
  });

  it("keeps Rider verified-account saves, photo upload and account security routes", () => {
    expect(rider).toContain('className={panel===\'edit\'?\'biloo-ref-profile-modal\'');
    expect(rider).toContain("saveAccount(account,form)");
    expect(rider).toContain("RiderPhotoEditor");
    expect(riderPhoto).toContain("uploadRiderAvatar(account, upload, thumbnail)");
    expect(riderPhoto).toContain("account?.avatar && !photoFailed");
    expect(rider).toContain("readOnly={!!account}");
    expect(rider).toContain("/account/manage");
    expect(rider).toContain("#account-deletion");
    expect(safetyStyles).toContain("dialog.nr-dialog.biloo-ref-profile-modal[open]");
    expect(dialog).toContain("className?: string");
  });

  it("keeps actual Rider preferences with settings collapsed by default", () => {
    expect(rider).toContain('defaultOpenId={null}');
    expect(rider).toContain("PermissionSettings");
    expect(rider).toContain("NexRideFeedbackSettings");
    expect(rider).toContain("NativeReliabilitySettings");
    expect(rider).toContain('role="switch"');
    expect(rider).toContain('setLanguage(\'am\')');
    expect(rider).toContain("AppearanceSelector");
    expect(rider).toContain("AppVersion");
    expect(rider).toContain("/explore/privacy");
    expect(rider).toContain("/explore/terms");
    expect(settings).toContain("defaultOpenId = null");
  });

  it("keeps Driver editable profile, photo, verified contacts, theme and notifications", () => {
    expect(driver).toContain('className="nr-app nr-driver-profile-subpage biloo-reference-driver-settings"');
    expect(driver).toContain('defaultOpenId={null}');
    expect(driver).toContain("DriverPhotoManager");
    expect(driver).toContain("loadDriverProfileData(session.user.id)");
    expect(driver).toContain('getUser()');
    expect(driver).toContain('.update({ full_name: cleanName })');
    expect(driver).toContain('readOnly aria-describedby="nr-phone-verify-note"');
    expect(driver).toContain("DriverThemeSelector");
    expect(driver).toContain("announceLanguage");
    expect(driver).toContain("PermissionSettings");
    expect(driver).toContain("NativeReliabilitySettings");
    expect(driver).toContain("NexRideFeedbackSettings");
    expect(driver).toContain("#account-deletion");
  });

  it("loads the original styles globally without replacing the production brand or data", () => {
    expect(root).toContain('import "./biloo-reference-account-safety.css"');
    expect(safetyStyles).toContain("#08295f");
    expect(safetyStyles).toContain("#f9c449");
    expect(safetyStyles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(safetyStyles).toContain("env(safe-area-inset-bottom");
  });
});

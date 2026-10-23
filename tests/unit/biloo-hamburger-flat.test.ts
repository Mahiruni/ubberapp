import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RIDER_NAVIGATION, DRIVER_NAVIGATION, ADMIN_NAVIGATION,
  ADMIN_AUX_NAVIGATION, navigationConflicts,
} from "../../lib/biloo-navigation-registry";

const read = (file:string) => readFileSync(join(process.cwd(),file),"utf8");

describe("Biloo zero-duplication navigation ownership", () => {
  it("owns one unique primary destination, label and icon within each app role", () => {
    expect(navigationConflicts(RIDER_NAVIGATION)).toEqual([]);
    expect(navigationConflicts(DRIVER_NAVIGATION)).toEqual([]);
    for (const values of [
      ADMIN_NAVIGATION.map(item=>({id:item.id,href:`/admin?module=${item.id}`,label:{en:item.label},icon:item.icon})),
      ADMIN_AUX_NAVIGATION.map(item=>({id:item.id,href:item.href,label:{en:item.label},icon:item.icon}))
    ]) expect(navigationConflicts(values)).toEqual([]);
  });

  it("detects duplicates before they can be added in future changes", () => {
    expect(navigationConflicts([
      {id:"home",href:"/",icon:"home",label:{en:"Home"}},
      {id:"trips",href:"/",icon:"home",label:{en:"Home"}},
    ])).toEqual(expect.arrayContaining(["href:/","icon:home","label:home"]));
  });

  it("renders just one Rider Account access point: its hamburger portrait", () => {
    const rider = read("components/nexride/rider-menu.tsx");
    const account = read("components/nexride/rider-profile.tsx");
    expect(rider).toContain("RIDER_NAVIGATION.map");
    expect(rider).toContain('className="biloo-menu-profile-card"');
    expect(rider).not.toContain('id: "settings"');
    expect(rider).not.toContain('id: "profile"');
    expect(account).not.toContain('title={say(\'My rides & receipts\'');
    expect(account).not.toContain('title={say(\'Wallet & payment methods\'');
    expect(account).not.toContain('title={say(\'Safety Center\'');
    expect(account).not.toContain('title={say(\'Help & support\'');
    expect(account).not.toContain('className="nr-account-secondary-actions"');
    expect(account).toContain('title={say(\'Account & security\'');
  });

  it("renders Driver navigation from the same registry, without account-owned duplicates", () => {
    const drawer = read("components/nexride/driver-app-shell.tsx");
    const account = read("components/nexride/driver-profile.tsx");
    expect(drawer).toContain("DRIVER_NAVIGATION.map");
    expect(drawer).toContain('className="biloo-menu-profile-card"');
    expect(drawer).not.toContain('className="nr-driver-menu-utility"');
    expect(account).not.toContain('title={say("Trip activity")}');
    expect(account).not.toContain('title={say("Earnings report")}');
    expect(account).not.toContain('title={say("Safety Center")}');
    expect(account).not.toContain('title={say("Help & support")}');
    expect(account).toContain('title={say("Payout account")}');
    expect(account).toContain('router.push("/driver/profile/documents")');
  });

  it("places account security in Account, not in a second settings menu", () => {
    const rider = read("components/nexride/rider-profile.tsx");
    const driver = read("components/nexride/driver-profile.tsx");
    const riderDrawer = read("components/nexride/rider-menu.tsx");
    const driverSettings = read("app/driver/profile/settings/page.tsx");
    expect(rider).toContain("router.push('/account/manage?role=rider#account-security')");
    expect(driver).toContain('router.push("/account/manage?role=driver#account-security")');
    expect(rider).not.toContain('id: "security"');
    expect(driverSettings).not.toContain('id: "security"');
    expect(driverSettings).not.toContain('id: "help"');
    expect(driverSettings).not.toContain("AppLockSettings");
    expect(riderDrawer).not.toContain("onSettings?");
    expect(riderDrawer).not.toContain('id === "settings"');
    expect(riderDrawer).toContain("RIDER_NAVIGATION.map");
  });

  it("keeps profile management intact with contextual photo editing and private account routes", () => {
    const rider = read("components/nexride/rider-profile.tsx");
    const driver = read("components/nexride/driver-profile.tsx");
    const driverSettings = read("app/driver/profile/settings/page.tsx");
    expect(rider).toContain("<RiderPhotoEditor");
    expect(driver).toContain("<DriverPhotoManager");
    expect(driver).toContain('router.push("/driver/profile/vehicle")');
    expect(driver).toContain('router.push("/driver/profile/payouts")');
    expect(driverSettings).toContain("PermissionSettings");
    expect(driverSettings).toContain('router.push("/driver/profile")');
  });

  it("matches the approved comfortable, circular and left-docked Rider/Driver drawer design", () => {
    const css=read("app/biloo-menu-refinement.css");
    const rider=read("components/nexride/rider-menu.tsx");
    const driver=read("components/nexride/driver-app-shell.tsx");
    const riderEntry=read("app/rider/page.tsx");
    expect(css).toContain("BILOO APPROVED CONFIGURATION");
    expect(css).toContain(".nr-driver-menu-trigger");
    expect(css).toContain("border-radius:50%!important");
    expect(css).toContain("justify-content:flex-start!important");
    expect(css).toContain("min-height:60px!important");
    expect(css).toContain("border-radius:0 22px 22px 0!important");
    expect(css).toContain("min-height:94px!important");
    expect(rider).toContain('className="biloo-menu-profile-card"');
    expect(driver).toContain('className="biloo-menu-profile-card"');
    expect(rider.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(driver.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(rider).not.toContain('id: "profile"');
    expect(driver).not.toContain('id: "account"');
    expect(driver).toContain('href="/rider" className="nr-driver-menu-role-switch"');
    expect(riderEntry).toContain("account_activate_rider_role");
  });

  it("enforces the approved comfortable circular Rider and Driver menu design", () => {
    const shared = read("app/biloo-menu-refinement.css");
    const driverStyle = read("app/driver/driver-wrapper-premium.css");
    const riderMenu = read("components/nexride/rider-menu.tsx");
    const driverMenu = read("components/nexride/driver-app-shell.tsx");
    const footer = read("tests/e2e/biloo-footer-navigation.spec.ts");
    expect(shared).toContain("Biloo approved comfortable Rider drawer density");
    expect(shared).toContain(".nr-rider-drawer-nav>button {");
    expect(shared).toContain("min-height:60px!important;");
    expect(shared).toContain("min-height:94px!important;");
    expect(shared).toContain(".nr-driver-standalone-menu .nr-driver-menu-trigger");
    expect(driverStyle).toContain("Biloo zero-duplication navigation v2");
    expect(driverStyle).toContain('data-home="true"] .nr-driver-home-menu-host .nr-driver-menu-trigger');
    expect(driverStyle).toContain("border-radius:50%!important;");
    expect(driverStyle).toContain(".nr-driver-menu-secondary>a");
    expect(riderMenu).toContain("MAIN NAVIGATION");
    expect(driverMenu).toContain("MAIN NAVIGATION");
    expect(driverMenu).toContain("Ride with Biloo");
    expect(driverMenu).toContain('<Link href="/rider" className="nr-driver-menu-role-switch"');
    expect(driverMenu).toContain('<Icon name="users" size={20}/>');
    expect(riderMenu.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(driverMenu.match(/className="biloo-menu-profile-card"/g)).toHaveLength(1);
    expect(footer).toContain("biloo-footer-nav");
  });

  it("keeps Admin sidebar and menu accessible without duplicate mobile footer", () => {
    const admin = read("app/admin/page.tsx");
    const css = read("app/admin/admin.css");
    expect(admin).toContain("ADMIN_NAVIGATION.map");
    expect(admin).toContain("ADMIN_AUX_NAVIGATION.map");
    expect(admin).not.toContain('<nav className="admin-mobile-nav"');
    expect(admin).toContain('className={`admin-sidebar ${navOpen ? "open" : ""}`}');
    expect(css).toContain(".admin-app .admin-mobile-nav{display:none!important}");
  });
});

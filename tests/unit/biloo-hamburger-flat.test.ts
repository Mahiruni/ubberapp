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

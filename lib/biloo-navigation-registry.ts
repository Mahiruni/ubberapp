/**
 * Biloo canonical navigation registry.
 * One primary owner for each destination. Account actions stay in Account,
 * never as duplicate drawer rows. Contextual map controls aren't navigation.
 * Keep route compatibility (including active-trip routes) outside this registry.
 */
import type { IconName } from "../components/nexride/ui";

type Localized = { en: string; am: string };
export type NavigationEntry<Id extends string = string> = {
  id: Id;
  href: string;
  icon: IconName;
  label: Localized;
  detail: Localized;
  group: "journeys" | "assistance" | "operations";
};
export const RIDER_NAVIGATION = [
  { id:"home", href:"/", icon:"home", label:{en:"Home",am:"መነሻ"}, detail:{en:"Book a ride",am:"ጉዞ ይያዙ"}, group:"journeys" },
  { id:"trips", href:"/rider/trips", icon:"clock", label:{en:"My Rides",am:"ጉዞዎቼ"}, detail:{en:"Trips and receipts",am:"ጉዞዎች እና ደረሰኞች"}, group:"journeys" },
  { id:"wallet", href:"/rider/wallet", icon:"wallet", label:{en:"Wallet",am:"ቦርሳ"}, detail:{en:"Payment methods and records",am:"ክፍያዎች እና መዝገቦች"}, group:"journeys" },
  { id:"saved", href:"/?screen=saved", icon:"star", label:{en:"Saved Places",am:"የተቀመጡ ቦታዎች"}, detail:{en:"Home, work and favorites",am:"ቤት፣ ስራ እና ተወዳጆች"}, group:"journeys" },
  { id:"safety", href:"/safety?role=rider", icon:"shield", label:{en:"Safety Center",am:"የደህንነት ማዕከል"}, detail:{en:"Emergency and trip safety",am:"የጉዞ ደህንነት መሳሪያዎች"}, group:"assistance" },
  { id:"messages", href:"/support?role=rider", icon:"chat", label:{en:"Help & Support",am:"እገዛ እና ድጋፍ"}, detail:{en:"Assistance with your rides",am:"የጉዞ እገዛ"}, group:"assistance" },
] as const satisfies readonly NavigationEntry[];

export const DRIVER_NAVIGATION = [
  { id:"home", href:"/driver/home", icon:"home", label:{en:"Home",am:"መነሻ"}, detail:{en:"Map and availability",am:"ካርታ እና ዝግጁነት"}, group:"journeys" },
  { id:"requests", href:"/driver/activity", icon:"clock", label:{en:"Activity",am:"እንቅስቃሴ"}, detail:{en:"Requests and trip history",am:"ጥያቄዎችና የጉዞ ታሪክ"}, group:"journeys" },
  { id:"earnings", href:"/driver/earnings", icon:"wallet", label:{en:"Earnings",am:"ገቢ"}, detail:{en:"Recorded trip income",am:"የተመዘገበ ገቢ"}, group:"journeys" },
  { id:"messages", href:"/support?role=driver", icon:"chat", label:{en:"Help & Support",am:"እገዛ እና ድጋፍ"}, detail:{en:"Driver assistance",am:"የአሽከርካሪ ድጋፍ"}, group:"assistance" },
  { id:"safety", href:"/safety?role=driver", icon:"shield", label:{en:"Safety Center",am:"የደህንነት ማዕከል"}, detail:{en:"Trip safety and emergencies",am:"የጉዞ ደህንነት"}, group:"assistance" },
] as const satisfies readonly NavigationEntry[];

export const ADMIN_NAVIGATION = [
  { id:"overview", label:"Dashboard", icon:"home" },
  { id:"rides", label:"Rides", icon:"navigation" },
  { id:"drivers", label:"Drivers", icon:"user" },
  { id:"verification", label:"Verification", icon:"check" },
  { id:"users", label:"Users", icon:"users" },
  { id:"accounts", label:"Identity & Accounts", icon:"lock" },
  { id:"finance", label:"Payments", icon:"money" },
  { id:"safety", label:"Safety", icon:"shield" },
  { id:"support", label:"Support", icon:"chat" },
  { id:"audit", label:"Audit Log", icon:"clock" },
] as const satisfies readonly { id:string; label:string; icon:IconName }[];
export const ADMIN_AUX_NAVIGATION = [
  { id:"biloo-pay", href:"/admin/finance", label:"Biloo Pay Finance", icon:"wallet" },
  { id:"campaign", href:"/admin/prelaunch-campaign", label:"Email Campaigns", icon:"mail" },
  { id:"messaging", href:"/admin/campaign-settings", label:"Messaging Security", icon:"settings" },
  { id:"reliability", href:"/admin/reliability", label:"Android Reliability", icon:"locate" },
] as const satisfies readonly { id:string; href:string; label:string; icon:IconName }[];

export type RiderNavigationId = (typeof RIDER_NAVIGATION)[number]["id"];
export type DriverNavigationId = (typeof DRIVER_NAVIGATION)[number]["id"];
export type AdminNavigationId = (typeof ADMIN_NAVIGATION)[number]["id"];

/** Used by tests and CI to prevent overlapping primary navigation ownership. */
export function navigationConflicts(items: readonly { id:string; href:string; icon:string; label:{en:string} }[]): string[] {
  const conflicts:string[] = [];
  for (const field of ["id","href","icon"] as const) {
    const seen = new Set<string>();
    for (const entry of items) {
      const value = entry[field].trim().toLowerCase();
      if (seen.has(value)) conflicts.push(`${field}:${value}`);
      seen.add(value);
    }
  }
  const labels = new Set<string>();
  for (const entry of items) {
    const key = entry.label.en.trim().toLowerCase();
    if (labels.has(key)) conflicts.push(`label:${key}`);
    labels.add(key);
  }
  return conflicts;
}

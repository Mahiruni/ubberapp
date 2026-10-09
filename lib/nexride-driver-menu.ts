/** The six and only six Driver menu categories. No Rider/Admin navigation here. */
export const DRIVER_CORE_MENU_ITEMS = [
  {
    id: "earnings",
    icon: "wallet",
    href: "/driver/earnings",
    en: "Earnings & Wallet",
    am: "ገቢ እና የገንዘብ ቦርሳ",
    detailEn: "Earnings reports, payouts and withdrawals",
    detailAm: "የገቢ ሪፖርት፣ ክፍያዎች እና ገንዘብ ማውጣት",
  },
  {
    id: "safety",
    icon: "shield",
    href: "/safety?role=driver",
    en: "Safety Toolkit & SOS",
    am: "የደህንነት መሣሪያዎች እና SOS",
    detailEn: "Emergency help and trip safety",
    detailAm: "አስቸኳይ እርዳታ እና የጉዞ ደህንነት",
  },
  {
    id: "profile",
    icon: "user",
    href: "/driver/profile",
    en: "Profile & Ratings",
    am: "መገለጫ እና ደረጃ",
    detailEn: "Driver identity, photo and ratings",
    detailAm: "የአሽከርካሪ መለያ፣ ፎቶ እና ደረጃ",
  },
  {
    id: "vehicle",
    icon: "navigation",
    href: "/driver/profile/vehicle",
    en: "Vehicles & Compliance",
    am: "ተሽከርካሪዎች እና ሕጋዊ ማረጋገጫ",
    detailEn: "Verified vehicle, licence and documents",
    detailAm: "ተሽከርካሪ፣ ፈቃድ እና የማረጋገጫ ሰነዶች",
  },
  {
    id: "preferences",
    icon: "settings",
    href: "/driver/profile/settings",
    en: "Preferences & Navigation",
    am: "ምርጫዎች እና አቅጣጫ",
    detailEn: "Driver settings, language and appearance",
    detailAm: "የአሽከርካሪ ቅንብሮች፣ ቋንቋ እና ገጽታ",
  },
  {
    id: "support",
    icon: "chat",
    href: "/support?role=driver",
    en: "Support Inbox & Help",
    am: "የድጋፍ መልዕክቶች እና እገዛ",
    detailEn: "Driver support and account messages",
    detailAm: "የአሽከርካሪ ድጋፍ እና የመለያ መልዕክቶች",
  },
] as const;

/** Useful destinations, grouped only in the contrasting drawer footer. */
export const DRIVER_MENU_FOOTER_LINKS = [
  { id: "dashboard", icon: "home", href: "/driver/home", en: "Dashboard", am: "መነሻ" },
  { id: "activity", icon: "clock", href: "/driver/activity", en: "Trip activity", am: "የጉዞ እንቅስቃሴ" },
  { id: "documents", icon: "card", href: "/driver/profile/documents", en: "My documents", am: "የእኔ ሰነዶች" },
] as const;

export type DriverCoreMenuId = (typeof DRIVER_CORE_MENU_ITEMS)[number]["id"];

export function driverCoreMenuForPath(pathname: string): DriverCoreMenuId | null {
  if (pathname.startsWith("/driver/earnings") || pathname.startsWith("/driver/profile/payouts")) return "earnings";
  if (pathname === "/safety" || pathname.startsWith("/safety/")) return "safety";
  if (pathname.startsWith("/driver/profile/vehicle") || pathname.startsWith("/driver/profile/documents") || pathname.startsWith("/driver/verification")) return "vehicle";
  if (pathname.startsWith("/driver/profile/settings")) return "preferences";
  if (pathname.startsWith("/support") || pathname.startsWith("/trip/chat")) return "support";
  if (pathname.startsWith("/driver/profile")) return "profile";
  return null;
}

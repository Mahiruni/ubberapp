"use client";

import Link from "next/link";
import { useContext } from "react";
import { RIDER_NAVIGATION } from "../../lib/biloo-navigation-registry";
import { Icon, LanguageContext } from "./ui";
import styles from "./rider-floating-dock.module.css";

export type RiderDockTab = "home" | "activity" | "account";

export function RiderFloatingDock({ active, onNavigate }: {
  active: RiderDockTab;
  onNavigate?: (tab: RiderDockTab) => void;
}) {
  const language = useContext(LanguageContext);
  const items = [
    { id: "home", href: RIDER_NAVIGATION[0].href, icon: "home", en: "Home", am: "መነሻ" },
    { id: "activity", href: RIDER_NAVIGATION[1].href, icon: "clock", en: "Activity", am: "እንቅስቃሴ" },
    { id: "account", href: "/?screen=profile", icon: "user", en: "Account", am: "መለያ" },
  ] as const;
  return <nav className={`biloo-rider-floating-dock ${styles.dock}`} aria-label={language === "am" ? "የተሳፋሪ አሰሳ" : "Rider tabs"}>
    {items.map(item => <Link
      key={item.id}
      href={item.href}
      aria-label={`${language === "am" ? item.am : item.en} ${language === "am" ? "ትር" : "tab"}`}
      aria-current={active === item.id ? "page" : undefined}
      onClick={event => {
        if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate(item.id);
      }}
    ><Icon name={item.icon} size={22} /><span>{language === "am" ? item.am : item.en}</span></Link>)}
  </nav>;
}

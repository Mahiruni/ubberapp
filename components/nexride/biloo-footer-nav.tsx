"use client";

import Link from "next/link";
import { Icon, type IconName } from "./ui";

export type BilooFooterItem = {
  id: string;
  label: string;
  icon: IconName;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function BilooFooterNav({
  role,
  items,
  active,
}: {
  role: "rider" | "driver";
  items: BilooFooterItem[];
  active: string;
}) {
  return (
    <nav className="biloo-footer-nav" data-role={role} aria-label={role === "rider" ? "Rider bottom navigation" : "Driver bottom navigation"}>
      <div className="biloo-footer-nav__surface">
        {items.map(item => {
          const selected = active === item.id;
          const label = (
            <>
              <span className="biloo-footer-nav__symbol"><Icon name={item.icon} size={21} /></span>
              <span className="biloo-footer-nav__label">{item.label}</span>
              <span className="biloo-footer-nav__indicator" aria-hidden="true" />
            </>
          );
          const className = "biloo-footer-nav__item" + (selected ? " is-active" : "");
          return item.href ? (
            <Link
              key={item.id}
              href={item.href}
              className={className}
              prefetch={item.href.startsWith("/driver/") ? undefined : false}
              aria-current={selected ? "page" : undefined}
              aria-disabled={item.disabled || undefined}
              tabIndex={item.disabled ? -1 : undefined}
              onClick={item.disabled ? event => event.preventDefault() : undefined}
            >{label}</Link>
          ) : (
            <button
              key={item.id}
              type="button"
              className={className}
              aria-current={selected ? "page" : undefined}
              onClick={item.onClick}
              disabled={item.disabled}
            >{label}</button>
          );
        })}
      </div>
    </nav>
  );
}

export function riderFooterLinks(): BilooFooterItem[] {
  return [
    { id: "home", label: "Home", icon: "home", href: "/" },
    { id: "activity", label: "Activity", icon: "clock", href: "/rider/trips" },
    { id: "wallet", label: "Wallet", icon: "wallet", href: "/rider/wallet" },
    { id: "support", label: "Support", icon: "headphones", href: "/support" },
    { id: "account", label: "Account", icon: "user", href: "/?screen=profile" },
  ];
}

export function driverFooterLinks(): BilooFooterItem[] {
  return [
    { id: "home", label: "Home", icon: "home", href: "/driver/home" },
    { id: "activity", label: "Activity", icon: "clock", href: "/driver/activity" },
    { id: "map", label: "Map", icon: "navigation", href: "/driver/map" },
    { id: "earnings", label: "Earnings", icon: "wallet", href: "/driver/earnings" },
    { id: "account", label: "Account", icon: "user", href: "/driver/profile" },
  ];
}

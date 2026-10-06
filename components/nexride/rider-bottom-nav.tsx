"use client";

import { useEffect, useState } from "react";
import { PREVIEW_STORAGE_KEY } from "../../lib/nexride-startup";
import { Icon, type IconName, useTranslation } from "./ui";

export type RiderPrimaryNavId =
  | "home"
  | "trips"
  | "safety"
  | "messages"
  | "profile";

type RiderTheme = "light" | "dark";

export function usePersistedRiderTheme(): RiderTheme {
  const [theme, setTheme] = useState<RiderTheme>("light");

  useEffect(() => {
    const readTheme = () => {
      try {
        const raw =
          localStorage.getItem(PREVIEW_STORAGE_KEY) ||
          localStorage.getItem("nexride-state") ||
          "{}";
        const state = JSON.parse(raw) as { theme?: unknown };
        setTheme(state.theme === "dark" ? "dark" : "light");
      } catch {
        setTheme("light");
      }
    };

    readTheme();
    const onStorage = (event: StorageEvent) => {
      if (event.key === PREVIEW_STORAGE_KEY || event.key === "nexride-state") {
        readTheme();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return theme;
}

export function RiderBottomNavigation({
  active,
  onNavigate,
  locked = false,
}: {
  active: string;
  onNavigate?: (id: RiderPrimaryNavId) => void;
  locked?: boolean;
}) {
  const t = useTranslation();
  const items: {
    id: RiderPrimaryNavId;
    label: string;
    icon: IconName;
    href: string;
  }[] = [
    { id: "home", label: t("home"), icon: "home", href: "/" },
    { id: "trips", label: t("activity"), icon: "clock", href: "/rider/trips" },
    { id: "safety", label: t("safety"), icon: "shield", href: "/safety?role=rider" },
    { id: "messages", label: t("messages"), icon: "chat", href: "/support?role=rider" },
    { id: "profile", label: t("account"), icon: "user", href: "/?screen=profile" },
  ];

  const navigate = (id: RiderPrimaryNavId, href: string) => {
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    window.location.assign(href);
  };

  return (
    <nav className="nr-rider-bottom-nav" aria-label="Primary rider navigation">
      <div className="nr-rider-bottom-nav-inner">
        {items.map((item) => {
          const selected = active === item.id;
          const disabled = locked && item.id !== "safety";
          return (
            <button
              key={item.id}
              type="button"
              className={selected ? "active" : ""}
              aria-current={selected ? "page" : undefined}
              aria-label={item.label}
              disabled={disabled}
              onClick={() => navigate(item.id, item.href)}
            >
              <span className="nr-rider-nav-icon" aria-hidden="true">
                <Icon name={item.icon} size={21} />
              </span>
              <span className="nr-rider-nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

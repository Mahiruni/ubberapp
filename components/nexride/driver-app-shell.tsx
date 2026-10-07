"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, LanguageContext, type IconName } from "./ui";
import { supabase } from "../../lib/supabase";

export type DriverThemePreference = "system" | "light" | "dark";
export type DriverResolvedTheme = "light" | "dark";
export type DriverNavId = "home" | "requests" | "earnings" | "messages" | "account";

const DRIVER_THEME_STORAGE_KEY = "nexride.driver.theme";
const DRIVER_THEME_EVENT = "nexride:driver-theme-change";

type DriverThemeContextValue = {
  preference: DriverThemePreference;
  resolvedTheme: DriverResolvedTheme;
  setPreference: (preference: DriverThemePreference) => void;
};

const DriverThemeContext = createContext<DriverThemeContextValue | null>(null);

function isThemePreference(value: unknown): value is DriverThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function useDriverThemeState(): DriverThemeContextValue {
  const [preference, setPreferenceState] = useState<DriverThemePreference>("system");
  const [systemDark, setSystemDark] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem(DRIVER_THEME_STORAGE_KEY); } catch {}
      setPreferenceState(isThemePreference(stored) ? stored : "system");
      setSystemDark(media.matches);
    };
    const onMedia = () => setSystemDark(media.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === DRIVER_THEME_STORAGE_KEY) {
        setPreferenceState(isThemePreference(event.newValue) ? event.newValue : "system");
      }
    };
    const onTheme = (event: Event) => {
      const value = (event as CustomEvent<DriverThemePreference>).detail;
      if (isThemePreference(value)) setPreferenceState(value);
    };

    read();
    media.addEventListener?.("change", onMedia);
    window.addEventListener("storage", onStorage);
    window.addEventListener(DRIVER_THEME_EVENT, onTheme);
    return () => {
      media.removeEventListener?.("change", onMedia);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(DRIVER_THEME_EVENT, onTheme);
    };
  }, []);

  const setPreference = useCallback((next: DriverThemePreference) => {
    setPreferenceState(next);
    try { localStorage.setItem(DRIVER_THEME_STORAGE_KEY, next); } catch {}
    window.dispatchEvent(new CustomEvent<DriverThemePreference>(DRIVER_THEME_EVENT, { detail: next }));
  }, []);

  const resolvedTheme: DriverResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  return { preference, resolvedTheme, setPreference };
}

export function usePersistedDriverTheme() {
  return useDriverThemeState();
}

export function useDriverTheme() {
  const value = useContext(DriverThemeContext);
  if (!value) throw new Error("useDriverTheme must be used inside DriverAppShell");
  return value;
}

function DriverThemeProvider({ children }: { children: ReactNode }) {
  const value = useDriverThemeState();
  return <DriverThemeContext.Provider value={value}>{children}</DriverThemeContext.Provider>;
}

const NAV_ITEMS: Array<{ id: DriverNavId; icon: IconName; href: string; en: string; am: string }> = [
  { id: "home", icon: "home", href: "/driver/home", en: "Home", am: "መነሻ" },
  { id: "requests", icon: "navigation", href: "/driver/activity", en: "Requests", am: "ጥያቄዎች" },
  { id: "earnings", icon: "wallet", href: "/driver/earnings", en: "Earnings", am: "ገቢ" },
  { id: "messages", icon: "chat", href: "/support?role=driver", en: "Messages", am: "መልዕክቶች" },
  { id: "account", icon: "user", href: "/driver/profile", en: "Account", am: "መለያ" },
];

export function driverNavForPath(pathname: string): DriverNavId {
  if (pathname.startsWith("/driver/earnings")) return "earnings";
  if (
    pathname.startsWith("/driver/request") ||
    pathname.startsWith("/driver/activity") ||
    pathname.startsWith("/driver/navigation") ||
    pathname.startsWith("/driver/pickup")
  ) return "requests";
  if (pathname.startsWith("/driver/profile") || pathname.startsWith("/driver/verification")) return "account";
  if (pathname.startsWith("/support") || pathname.startsWith("/trip/chat")) return "messages";
  return "home";
}

export function DriverBottomNav({ activeOverride, subdued = false }: { activeOverride?: DriverNavId; subdued?: boolean }) {
  const pathname = usePathname();
  const language = useContext(LanguageContext);
  const active = activeOverride || driverNavForPath(pathname);

  return (
    <nav
      className="nr-driver-global-nav"
      aria-label={language === "am" ? "የአሽከርካሪ ዋና አሰሳ" : "Driver primary navigation"}
      data-subdued={subdued ? "true" : "false"}
    >
      <div className="nr-driver-global-nav-inner">
        {NAV_ITEMS.map((item) => {
          const selected = active === item.id;
          const label = language === "am" ? item.am : item.en;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="nr-driver-global-nav-item"
              data-active={selected ? "true" : "false"}
              aria-current={selected ? "page" : undefined}
              aria-label={label}
            >
              <span className="nr-driver-global-nav-icon" aria-hidden="true"><Icon name={item.icon} size={22} /></span>
              <span className="nr-driver-global-nav-label">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function titleForPath(pathname: string) {
  if (pathname.startsWith("/driver/earnings/report")) return "Earnings report";
  if (pathname.startsWith("/driver/earnings")) return "Earnings";
  if (pathname.startsWith("/driver/request")) return "Ride request";
  if (pathname.startsWith("/driver/activity")) return "Requests";
  if (pathname.startsWith("/driver/navigation")) return "Trip navigation";
  if (pathname.startsWith("/driver/pickup")) return "Pickup";
  if (pathname.startsWith("/driver/profile/documents")) return "Documents";
  if (pathname.startsWith("/driver/profile/vehicle")) return "Vehicle";
  if (pathname.startsWith("/driver/profile/payouts")) return "Payouts";
  if (pathname.startsWith("/driver/profile/settings")) return "Settings";
  if (pathname.startsWith("/driver/profile")) return "Account";
  return "NexRide Driver";
}

function backTargetForPath(pathname: string) {
  if (pathname.startsWith("/driver/earnings/report")) return "/driver/earnings";
  if (pathname.startsWith("/driver/profile/")) return "/driver/profile";
  if (
    pathname.startsWith("/driver/request") ||
    pathname.startsWith("/driver/navigation") ||
    pathname.startsWith("/driver/pickup")
  ) return "/driver/home";
  return "";
}

function isPublicDriverPath(pathname: string) {
  return (
    pathname === "/driver" ||
    pathname.startsWith("/driver/auth") ||
    pathname.startsWith("/driver/onboarding") ||
    pathname.startsWith("/driver/verification")
  );
}

function isTripFocusPath(pathname: string) {
  return (
    pathname.startsWith("/driver/request") ||
    pathname.startsWith("/driver/navigation") ||
    pathname.startsWith("/driver/pickup")
  );
}

function DriverThemeButton() {
  const { preference, resolvedTheme, setPreference } = useDriverTheme();
  const language = useContext(LanguageContext);
  const label =
    preference === "system"
      ? language === "am" ? "ገጽታ፦ ስርዓት" : "Theme: System"
      : preference === "light"
        ? language === "am" ? "ገጽታ፦ ብርሃን" : "Theme: Light"
        : language === "am" ? "ገጽታ፦ ጨለማ" : "Theme: Dark";

  const cycle = () => {
    setPreference(preference === "system" ? "light" : preference === "light" ? "dark" : "system");
  };

  return (
    <button type="button" className="nr-driver-theme-button" onClick={cycle} aria-label={label} title={label}>
      <Icon name={preference === "system" ? "globe" : resolvedTheme === "dark" ? "moon" : "sun"} size={20} />
    </button>
  );
}

export function DriverThemeSelector() {
  const { preference, setPreference } = useDriverTheme();
  const language = useContext(LanguageContext);
  const choices: Array<{ id: DriverThemePreference; en: string; am: string; icon: IconName }> = [
    { id: "system", en: "System", am: "ስርዓት", icon: "globe" },
    { id: "light", en: "Light", am: "ብርሃን", icon: "sun" },
    { id: "dark", en: "Dark", am: "ጨለማ", icon: "moon" },
  ];

  return (
    <div className="nr-driver-theme-selector" role="group" aria-label={language === "am" ? "ገጽታ" : "Appearance"}>
      {choices.map((choice) => (
        <button
          type="button"
          key={choice.id}
          data-active={preference === choice.id ? "true" : "false"}
          aria-pressed={preference === choice.id}
          onClick={() => setPreference(choice.id)}
        >
          <Icon name={choice.icon} size={17} />
          <span>{language === "am" ? choice.am : choice.en}</span>
        </button>
      ))}
    </div>
  );
}

function DriverHeader({ pathname }: { pathname: string }) {
  const router = useRouter();
  const language = useContext(LanguageContext);
  const [identity, setIdentity] = useState({ name: "Driver", avatarUrl: "" });
  const [online, setOnline] = useState(true);
  const home = pathname === "/driver/home";
  const backTarget = backTargetForPath(pathname);
  const title = titleForPath(pathname);

  useEffect(() => {
    let active = true;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    void supabase.auth.getSession().then(({ data }) => {
      if (!active || !data.session) return;
      const metadata = data.session.user.user_metadata || {};
      const name =
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        (typeof metadata.name === "string" && metadata.name.trim()) ||
        "Driver";
      const avatarUrl =
        (typeof metadata.avatar_url === "string" && metadata.avatar_url) ||
        (typeof metadata.avatarUrl === "string" && metadata.avatarUrl) ||
        "";
      setIdentity({ name, avatarUrl });
    });

    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const initials = useMemo(
    () => identity.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR",
    [identity.name],
  );

  return (
    <header className="nr-driver-global-header" data-map={home || isTripFocusPath(pathname) ? "true" : "false"}>
      <div className="nr-driver-global-header-inner">
        <div className="nr-driver-global-header-side nr-driver-global-header-left">
          {home ? (
            <button type="button" className="nr-driver-global-avatar" onClick={() => router.push("/driver/profile")} aria-label={language === "am" ? "የአሽከርካሪ መለያ ክፈት" : "Open driver account"}>
              {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <span>{initials}</span>}
            </button>
          ) : backTarget ? (
            <button type="button" className="nr-driver-global-icon-button" onClick={() => router.push(backTarget)} aria-label={language === "am" ? "ተመለስ" : "Back"}>
              <Icon name="back" size={21} />
            </button>
          ) : <span className="nr-driver-global-header-spacer" aria-hidden="true" />}
        </div>

        <div className="nr-driver-global-header-title">
          {home ? (
            <>
              <strong>NexRide</strong>
              <span>{language === "am" ? "አሽከርካሪ" : "Driver"}</span>
            </>
          ) : (
            <>
              <small>{language === "am" ? "NEXRIDE · አሽከርካሪ" : "NEXRIDE · DRIVER"}</small>
              <strong>{title}</strong>
            </>
          )}
          {!online && <em>{language === "am" ? "ከመስመር ውጭ" : "Offline"}</em>}
        </div>

        <div className="nr-driver-global-header-side nr-driver-global-header-right"><DriverThemeButton /></div>
      </div>
    </header>
  );
}

function DriverShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { preference, resolvedTheme } = useDriverTheme();
  if (isPublicDriverPath(pathname)) return <>{children}</>;

  const tripFocus = isTripFocusPath(pathname);

  return (
    <div className="nr-driver-app-shell" data-theme={resolvedTheme} data-theme-preference={preference} data-trip-focus={tripFocus ? "true" : "false"}>
      <DriverHeader pathname={pathname} />
      <div className="nr-driver-shell-content" data-trip-focus={tripFocus ? "true" : "false"}>{children}</div>
      <DriverBottomNav subdued={tripFocus} />
    </div>
  );
}

export function DriverAppShell({ children }: { children: ReactNode }) {
  return <DriverThemeProvider><DriverShellChrome>{children}</DriverShellChrome></DriverThemeProvider>;
}

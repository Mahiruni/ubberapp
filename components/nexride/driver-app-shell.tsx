"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useId,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, LanguageContext, type IconName } from "./ui";
import { DRIVER_CORE_MENU_ITEMS, DRIVER_MENU_FOOTER_LINKS, driverCoreMenuForPath } from "../../lib/nexride-driver-menu";
import { supabase } from "../../lib/supabase";
import { DriverCancellationNotice } from "./driver-cancellation-notice";
import { DriverSessionBridge } from "./driver-session-bridge";
import { explicitSignOutRole } from "../../lib/nexride-startup";

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

function DriverHamburgerMenu({ activeOverride }: { activeOverride?: DriverNavId }) {
  const pathname = usePathname();
  const language = useContext(LanguageContext);
  const { resolvedTheme } = useDriverTheme();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState({ name: "Driver", avatarUrl: "" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const instanceId = useId();
  const drawerId = `nr-driver-menu-${instanceId}`;
  const titleId = `nr-driver-menu-title-${instanceId}`;
  const say = (en: string, am: string) => language === "am" ? am : en;
  const selectedId = driverCoreMenuForPath(pathname) ??
    (activeOverride === "earnings" ? "earnings"
      : activeOverride === "messages" ? "support"
      : activeOverride === "account" ? "profile"
      : null);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted || !data.session) return;
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
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  // A portalled dialog cannot be trapped under the map, fixed trip wrapper, or header.
  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const selector = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusTimer = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const elements = Array.from(panelRef.current.querySelectorAll<HTMLElement>(selector))
        .filter(element => element.getClientRects().length > 0);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(focusTimer);
      document.body.style.overflow = priorOverflow;
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  const initials = useMemo(
    () => identity.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "DR",
    [identity.name],
  );

  const menuRows = DRIVER_CORE_MENU_ITEMS.map((item) => {
    const selected = selectedId === item.id;
    const label = language === "am" ? item.am : item.en;
    const detail = language === "am" ? item.detailAm : item.detailEn;
    return (
      <Link
        key={item.id}
        href={item.href}
        className="nr-driver-menu-row"
        data-active={selected ? "true" : "false"}
        aria-current={selected ? "page" : undefined}
        onClick={() => setOpen(false)}
      >
        <span className="nr-driver-menu-row-icon"><Icon name={item.icon} size={20} /></span>
        <span className="nr-driver-menu-row-copy"><strong>{label}</strong><small>{detail}</small></span>
        {selected ? <span className="nr-driver-menu-active-dot" aria-hidden="true" /> : <Icon name="chevron" size={16} />}
      </Link>
    );
  });

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nr-driver-menu-trigger"
        data-open={open ? "true" : "false"}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls={drawerId}
        aria-haspopup="dialog"
        aria-label={say(open ? "Close driver menu" : "Open driver menu", open ? "የአሽከርካሪ ምናሌን ዝጋ" : "የአሽከርካሪ ምናሌን ክፈት")}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="nr-driver-menu-layer nr-driver-menu-overlay" data-theme={resolvedTheme}>
          <button className="nr-driver-menu-backdrop" type="button" tabIndex={-1} aria-label={say("Close menu", "ምናሌን ዝጋ")} onClick={() => setOpen(false)} />
          <aside ref={panelRef} id={drawerId} className="nr-driver-menu-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <div className="nr-driver-menu-scroll">
              <header className="nr-driver-menu-head">
                <div className="nr-driver-menu-identity">
                  <div className="nr-driver-menu-avatar">
                    {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <span>{initials}</span>}
                  </div>
                  <div>
                    <small>{say("NEXRIDE · DRIVER", "NEXRIDE · አሽከርካሪ")}</small>
                    <strong id={titleId}>{identity.name}</strong>
                  </div>
                </div>
                <button ref={closeRef} type="button" className="nr-driver-menu-close" onClick={() => setOpen(false)} aria-label={say("Close menu", "ዝጋ")}>
                  <Icon name="close" size={21} />
                </button>
              </header>
              <div className="nr-driver-menu-section-label">{say("Your NexRide", "የእርስዎ NexRide")}</div>
              <nav className="nr-driver-menu-nav nr-driver-menu-nav-core" aria-label={say("Driver navigation", "የአሽከርካሪ አሰሳ")}>
                {menuRows}
              </nav>
            </div>

            <footer className="nr-driver-menu-promo" aria-label={say("Driver quick access", "ፈጣን መዳረሻ")}>
              <div className="nr-driver-menu-promo-hero">
                <div className="nr-driver-menu-promo-brand">
                  <span className="nr-driver-menu-promo-mark"><img src="/brand/nexride-mark.svg" alt="" width="33" height="33" /></span>
                  <div><strong>NexRide</strong><small>{say("Drive. Earn. Grow.", "ያሽከርክሩ። ያግኙ። ያድጉ።")}</small></div>
                </div>
                <div className="nr-driver-menu-car-track" aria-hidden="true">
                  <svg className="nr-driver-menu-car-motion" viewBox="0 0 116 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M10 43h98" stroke="#75BDA8" strokeWidth="1.4" strokeLinecap="round" strokeDasharray="5 6" opacity=".55" />
                    <path d="M19 35V28c0-2 2-4 4-4h9l10-12c1.2-1.5 3.2-2 5-2h24c3 0 5 1 7 3l9 11h9c3 0 5 3 5 6v8H19v-3Z" fill="#F2FAF7" />
                    <path d="M44 14h26c2 0 3 1 4 2l7 8H35l9-10Z" fill="#60CEB7" />
                    <path d="M58 15v9" stroke="#0D4050" strokeWidth="2" />
                    <path d="M22 38h77" stroke="#0D4050" strokeWidth="3" strokeLinecap="round" />
                    <circle className="nr-driver-menu-car-wheel" cx="37" cy="38" r="8" fill="#092238" stroke="#DCFDF0" strokeWidth="2" />
                    <circle className="nr-driver-menu-car-wheel" cx="82" cy="38" r="8" fill="#092238" stroke="#DCFDF0" strokeWidth="2" />
                    <circle cx="37" cy="38" r="3" fill="#38D9A0" />
                    <circle cx="82" cy="38" r="3" fill="#38D9A0" />
                    <path d="M95 29h5" stroke="#F8D678" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
              <div className="nr-driver-menu-promo-label">{say("QUICK ACCESS", "ፈጣን መዳረሻ")}</div>
              <div className="nr-driver-menu-promo-links">
                {DRIVER_MENU_FOOTER_LINKS.map((item) => (
                  <Link key={item.id} href={item.href} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} size={18} />
                    <span>{language === "am" ? item.am : item.en}</span>
                    <Icon name="chevron" size={14} />
                  </Link>
                ))}
              </div>
              <small className="nr-driver-menu-promo-tagline">{say("Better Rides. A Brighter Tomorrow.", "የተሻለ ጉዞ። ብሩህ ነገ።")}</small>
            </footer>
          </aside>
        </div>,
        document.body
      )}
    </>
  );
}

export function DriverStandaloneMenu({ activeOverride }: { activeOverride?: DriverNavId }) {
  const theme = usePersistedDriverTheme();
  return (
    <DriverThemeContext.Provider value={theme}>
      <div className="nr-driver-standalone-menu" data-theme={theme.resolvedTheme}>
        <DriverHamburgerMenu activeOverride={activeOverride} />
      </div>
    </DriverThemeContext.Provider>
  );
}

function titleForPath(pathname: string, language: "en" | "am") {
  const say = (en: string, am: string) => language === "am" ? am : en;
  if (pathname.startsWith("/driver/earnings/report")) return say("Earnings report", "የገቢ ሪፖርት");
  if (pathname.startsWith("/driver/earnings")) return say("Earnings", "ገቢ");
  if (pathname.startsWith("/driver/request")) return say("Ride request", "የጉዞ ጥያቄ");
  if (pathname.startsWith("/driver/activity")) return say("Requests", "ጥያቄዎች");
  if (pathname.startsWith("/driver/navigation")) return say("Trip navigation", "የጉዞ አቅጣጫ");
  if (pathname.startsWith("/driver/pickup")) return say("Pickup", "መነሻ");
  if (pathname.startsWith("/driver/profile/documents")) return say("Documents", "ሰነዶች");
  if (pathname.startsWith("/driver/profile/vehicle")) return say("Vehicle", "ተሽከርካሪ");
  if (pathname.startsWith("/driver/profile/payouts")) return say("Payouts", "ክፍያዎች");
  if (pathname.startsWith("/driver/profile/settings")) return say("Settings", "ቅንብሮች");
  if (pathname.startsWith("/driver/profile")) return say("Account", "መለያ");
  return language === "am" ? "NexRide አሽከርካሪ" : "NexRide Driver";
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
  const [online, setOnline] = useState(true);
  const home = pathname === "/driver/home";
  const backTarget = backTargetForPath(pathname);
  const title = titleForPath(pathname, language);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (home) {
    return (
      <div className="nr-driver-home-menu-host">
        <DriverHamburgerMenu />
      </div>
    );
  }

  return (
    <header className="nr-driver-global-header" data-map={isTripFocusPath(pathname) ? "true" : "false"}>
      <div className="nr-driver-global-header-inner">
        <div className="nr-driver-global-header-side nr-driver-global-header-left">
          {backTarget ? (
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

        <div className="nr-driver-global-header-side nr-driver-global-header-right">
          <DriverHamburgerMenu />
        </div>
      </div>
    </header>
  );
}

function DriverShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { preference, resolvedTheme } = useDriverTheme();
  const [blockedByLogout, setBlockedByLogout] = useState(false);
  const isPublic = isPublicDriverPath(pathname);

  useEffect(() => {
    const signedOut = Boolean(explicitSignOutRole(window.localStorage));
    setBlockedByLogout(signedOut && !isPublic);
    if (signedOut && !isPublic) router.replace("/driver/auth?logged_out=1");
  }, [isPublic, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (blockedByLogout) return null;

  const tripFocus = isTripFocusPath(pathname);
  const home = pathname === "/driver/home";

  return (
    <div className="nr-driver-app-shell" data-theme={resolvedTheme} data-theme-preference={preference} data-trip-focus={tripFocus ? "true" : "false"} data-home={home ? "true" : "false"}>
      <DriverHeader pathname={pathname} />
      <DriverSessionBridge />
      <DriverCancellationNotice pathname={pathname} />
      <div className="nr-driver-shell-content" data-trip-focus={tripFocus ? "true" : "false"}>{children}</div>
    </div>
  );
}

export function DriverAppShell({ children }: { children: ReactNode }) {
  return <DriverThemeProvider><DriverShellChrome>{children}</DriverShellChrome></DriverThemeProvider>;
}

"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon, LanguageContext, type IconName } from "./ui";
import { announceLanguage } from "./language-provider";
import { supabase } from "../../lib/supabase";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { DriverCancellationNotice } from "./driver-cancellation-notice";
import { DriverSessionBridge } from "./driver-session-bridge";
import { markExplicitSignOut, retryStartup } from "../../lib/nexride-startup";

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

const NAV_DETAILS: Record<DriverNavId, { en: string; am: string }> = {
  home: { en: "Map and availability", am: "ካርታ እና ዝግጁነት" },
  requests: { en: "Ride requests and activity", am: "የጉዞ ጥያቄዎች እና እንቅስቃሴ" },
  earnings: { en: "Income and payout reporting", am: "ገቢ እና የክፍያ ሪፖርት" },
  messages: { en: "Trip messages and support", am: "የጉዞ መልዕክቶች እና ድጋፍ" },
  account: { en: "Profile, vehicle and documents", am: "መለያ፣ ተሽከርካሪ እና ሰነዶች" },
};

function DriverHamburgerMenu({ activeOverride }: { activeOverride?: DriverNavId }) {
  const pathname = usePathname();
  const language = useContext(LanguageContext);
  const theme = useDriverTheme();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState({ name: "Driver", avatarUrl: "" });
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const active = activeOverride || driverNavForPath(pathname);

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
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = useMemo(
    () => identity.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR",
    [identity.name],
  );

  const signOutDriver = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData.session;

      if (session) {
        const activeRide = await supabase
          .from("ride_requests")
          .select("id,status")
          .eq("assigned_driver_id", session.user.id)
          .in("status", ["accepted", "arrived_pickup", "in_trip"])
          .limit(1)
          .maybeSingle();

        if (activeRide.error) {
          setSignOutError(language === "am" ? "ንቁ ጉዞዎን ማረጋገጥ አልተቻለም። እንደገና ይሞክሩ።" : "NexRide could not verify your active-trip status. Try again.");
          setSigningOut(false);
          return;
        }

        if (activeRide.data) {
          setSignOutError(language === "am" ? "ከመውጣትዎ በፊት ንቁ ጉዞዎን ያጠናቅቁ ወይም ይሰርዙ።" : "Finish or cancel your active trip before logging out.");
          setSigningOut(false);
          return;
        }

        const offlineResponse = await nexrideApiFetch("/api/driver/availability", {
          method: "PATCH",
          body: JSON.stringify({ online: false }),
        });
        if (!offlineResponse.ok && offlineResponse.status !== 409) {
          setSignOutError(language === "am" ? "ከመውጣትዎ በፊት የአሽከርካሪ ሁኔታዎን ከመስመር ውጭ ማድረግ አልተቻለም።" : "NexRide could not take your Driver account offline. Try again.");
          setSigningOut(false);
          return;
        }

        const { error: authError } = await supabase.auth.signOut({ scope: "local" });
        if (authError) throw authError;
        const verified = await supabase.auth.getSession();
        if (verified.error || verified.data.session) throw new Error("session_still_active");
      }

      markExplicitSignOut("driver");
      retryStartup(false);
      setOpen(false);
      window.location.replace("/driver/auth?logged_out=1");
    } catch {
      setSignOutError(language === "am" ? "መውጣት አልተጠናቀቀም። እንደገና ይሞክሩ።" : "Log out could not be completed. Please try again.");
      setSigningOut(false);
    }
  };

  const driveItems = NAV_ITEMS.filter((item) => ["home", "requests", "earnings"].includes(item.id));
  const accountItems = NAV_ITEMS.filter((item) => ["messages", "account"].includes(item.id));

  const menuRows = (items: typeof NAV_ITEMS) =>
    items.map((item) => {
      const selected = active === item.id;
      const label = language === "am" ? item.am : item.en;
      const detail = language === "am" ? NAV_DETAILS[item.id].am : NAV_DETAILS[item.id].en;
      return (
        <Link
          key={item.id}
          href={item.href}
          className="nr-driver-menu-row"
          data-active={selected ? "true" : "false"}
          aria-current={selected ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          <span className="nr-driver-menu-row-icon"><Icon name={item.icon} size={21} /></span>
          <span className="nr-driver-menu-row-copy"><strong>{label}</strong><small>{detail}</small></span>
          {selected ? <span className="nr-driver-menu-active-dot" aria-hidden="true" /> : <Icon name="chevron" size={16} />}
        </Link>
      );
    });

  return (
    <>
      <button
        type="button"
        className="nr-driver-menu-trigger"
        data-open={open ? "true" : "false"}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="nr-driver-menu"
        aria-label={language === "am" ? (open ? "ምናሌን ዝጋ" : "የአሽከርካሪ ምናሌን ክፈት") : (open ? "Close driver menu" : "Open driver menu")}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      {open && (
        <div className="nr-driver-menu-layer" role="presentation">
          <button className="nr-driver-menu-backdrop" type="button" aria-label={language === "am" ? "ምናሌን ዝጋ" : "Close menu"} onClick={() => setOpen(false)} />
          <aside id="nr-driver-menu" className="nr-driver-menu-panel" role="dialog" aria-modal="true" aria-labelledby="nr-driver-menu-title">
            <div className="nr-driver-menu-head">
              <div className="nr-driver-menu-identity">
                <div className="nr-driver-menu-avatar">
                  {identity.avatarUrl ? <img src={identity.avatarUrl} alt="" /> : <span>{initials}</span>}
                </div>
                <div>
                  <small>{language === "am" ? "NEXRIDE · አሽከርካሪ" : "NEXRIDE · DRIVER"}</small>
                  <strong id="nr-driver-menu-title">{identity.name}</strong>
                </div>
              </div>
              <button ref={closeRef} type="button" className="nr-driver-menu-close" onClick={() => setOpen(false)} aria-label={language === "am" ? "ዝጋ" : "Close"}>
                <Icon name="close" size={21} />
              </button>
            </div>

            <div className="nr-driver-menu-section-label">{language === "am" ? "ማሽከርከር" : "DRIVE"}</div>
            <nav className="nr-driver-menu-nav" aria-label={language === "am" ? "የመንዳት አሰሳ" : "Drive navigation"}>
              {menuRows(driveItems)}
            </nav>

            <div className="nr-driver-menu-section-label">{language === "am" ? "መለያ" : "ACCOUNT"}</div>
            <nav className="nr-driver-menu-nav" aria-label={language === "am" ? "የመለያ አሰሳ" : "Account navigation"}>
              {menuRows(accountItems)}
            </nav>
            <div className="nr-driver-menu-utilities">
              <Link href="/safety?role=driver" className="nr-driver-menu-utility" onClick={() => setOpen(false)}>
                <Icon name="shield" size={19} /><span>{language === "am" ? "የደህንነት ማዕከል" : "Safety Center"}</span><Icon name="chevron" size={15} />
              </Link>
              <Link href="/driver/profile/settings" className="nr-driver-menu-utility" onClick={() => setOpen(false)}>
                <Icon name="settings" size={19} /><span>{language === "am" ? "ቅንብሮች" : "Settings"}</span><Icon name="chevron" size={15} />
              </Link>
            </div>

            <div className="nr-driver-menu-section-label">{language === "am" ? "ምርጫዎች" : "PREFERENCES"}</div>
            <div className="nr-driver-menu-preferences">
              <div className="nr-driver-menu-pref-head">
                <span>{language === "am" ? "ገጽታ" : "Appearance"}</span>
                <small>{theme.preference === "system" ? (language === "am" ? "ስርዓት" : "System") : theme.preference === "light" ? (language === "am" ? "ብርሃን" : "Light") : (language === "am" ? "ጨለማ" : "Dark")}</small>
              </div>
              <DriverThemeSelector />
              <div className="nr-driver-menu-language" role="group" aria-label={language === "am" ? "ቋንቋ" : "Language"}>
                <button type="button" data-active={language === "en" ? "true" : "false"} aria-pressed={language === "en"} onClick={() => announceLanguage("en")}>English</button>
                <button type="button" data-active={language === "am" ? "true" : "false"} aria-pressed={language === "am"} onClick={() => announceLanguage("am")}>አማርኛ</button>
              </div>
            </div>

            <footer className="nr-driver-menu-footer">
              <div className="nr-driver-menu-footer-brand">
                <span aria-hidden="true">N</span>
                <div>
                  <strong>NexRide</strong>
                  <small>{language === "am" ? "የተሻለ ጉዞ። ብሩህ ነገ።" : "Better Rides. A Brighter Tomorrow."}</small>
                </div>
              </div>
              <button type="button" className="nr-driver-menu-logout" onClick={() => void signOutDriver()} disabled={signingOut}>
                <Icon name="power" size={18} />
                <span>{signingOut ? (language === "am" ? "በመውጣት ላይ…" : "Logging out…") : (language === "am" ? "ውጣ" : "Log out")}</span>
              </button>
              {signOutError && <p role="alert">{signOutError}</p>}
            </footer>
          </aside>
        </div>
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
  const { preference, resolvedTheme } = useDriverTheme();
  if (isPublicDriverPath(pathname)) return <>{children}</>;

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

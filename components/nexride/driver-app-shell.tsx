"use client";

import { createPortal } from "react-dom";

import Link from "next/link";
import { AppVersion } from "./app-version";
import { MenuGroup } from "./menu-group";
import { registerNexRideBackHandler } from "../../lib/nexride-native-navigation";
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
import { useAppearance } from "../../lib/nexride-appearance";
import { AppearanceSelector } from "./appearance-selector";
import { Icon, LanguageContext } from "./ui";
import { DRIVER_NAVIGATION, type DriverNavigationId } from "../../lib/biloo-navigation-registry";
import { announceLanguage } from "./language-provider";
import { useSharedAccountPortrait } from '../../lib/nexride-shared-portrait';
import { supabase } from "../../lib/supabase";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { DriverCancellationNotice } from "./driver-cancellation-notice";
import { DriverSessionBridge } from "./driver-session-bridge";
import { explicitSignOutRole } from "../../lib/nexride-startup";
import { signOutNexRide } from "../../lib/nexride-sign-out";

export type DriverThemePreference = "system" | "light" | "dark";
export type DriverResolvedTheme = "light" | "dark";
export type DriverNavId = DriverNavigationId | "account";


type DriverThemeContextValue = {
  preference: DriverThemePreference;
  resolvedTheme: DriverResolvedTheme;
  setPreference: (preference: DriverThemePreference) => void;
};

const DriverThemeContext = createContext<DriverThemeContextValue | null>(null);

function useDriverThemeState(): DriverThemeContextValue {
  return useAppearance("driver");
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

const NAV_ITEMS = DRIVER_NAVIGATION.map(item => ({
  id: item.id, href: item.href, icon: item.icon, en: item.label.en, am: item.label.am,
  detail: item.detail, group: item.group,
}));

export function driverNavForPath(pathname: string): DriverNavId {
  if (pathname.startsWith("/driver/earnings")) return "earnings";
  // The legacy Driver map route belongs to Home, not a duplicate drawer item.
  if (pathname === "/driver/map") return "home";
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

function DriverHamburgerMenu({
  activeOverride,
  controlledOpen,
  onOpenChange,
}: {
  activeOverride?: DriverNavId;
  controlledOpen?: boolean;
  onOpenChange?: (nextOpen: boolean) => void;
}) {
  const pathname = usePathname();
  const { resolvedTheme } = useDriverTheme();
  const language = useContext(LanguageContext);
  const [standaloneOpen, setStandaloneOpen] = useState(false);
  const [driverPresence, setDriverPresence] = useState<{ online: boolean; rating: number | null } | null>(null);
  const open = controlledOpen ?? standaloneOpen;
  // In the Driver app shell, menu visibility also controls the map wrappers.
  // Standalone menus continue to manage their own state.
  const setOpen = useCallback((value: boolean | ((previous: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(open) : value;
    if (onOpenChange) onOpenChange(next);
    else setStandaloneOpen(next);
  }, [onOpenChange, open]);
  const portrait = useSharedAccountPortrait();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelTouchStart = useRef<{x:number;y:number}|null>(null);
  const active = activeOverride || driverNavForPath(pathname);

  useEffect(() => {
    if (!open) return;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") {
        const elements = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]') || []).filter(e => e.offsetParent !== null);
        const first = elements[0], last = elements[elements.length-1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener("keydown", onKey);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKey);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  // The drawer is transient UI: Android Back should close it, not end a trip.
  useEffect(() => {
    if (!open) return;
    return registerNexRideBackHandler(() => { setOpen(false); return true; }, 110);
  }, [open, setOpen]);

  // Read the authenticated Driver record; never label a driver Online or show a rating by assumption.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDriverPresence(null);
    const readPresence = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user || cancelled) return;
        const { data, error } = await supabase.from("drivers")
          .select("is_online,rating").eq("id", auth.user.id).maybeSingle();
        if (error || !data || cancelled || typeof data.is_online !== "boolean") return;
        const rating = typeof data.rating === "number" && Number.isFinite(data.rating) && data.rating > 0 && data.rating <= 5 ? data.rating : null;
        setDriverPresence({ online: data.is_online, rating });
      } catch {
        // Menu stays fully usable when availability cannot be read.
      }
    };
    void readPresence();
    return () => { cancelled = true; };
  }, [open]);

  const initials = useMemo(
    () => portrait.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "DR",
    [portrait.name],
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
          setSignOutError(language === "am" ? "ንቁ ጉዞዎን ማረጋገጥ አልተቻለም። እንደገና ይሞክሩ።" : "Biloo could not verify your active-trip status. Try again.");
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
          setSignOutError(language === "am" ? "ከመውጣትዎ በፊት የአሽከርካሪ ሁኔታዎን ከመስመር ውጭ ማድረግ አልተቻለም።" : "Biloo could not take your Driver account offline. Try again.");
          setSigningOut(false);
          return;
        }

        await signOutNexRide("driver");
      }

      if (!session) await signOutNexRide("driver");
      setOpen(false);
      window.location.replace("/driver/auth?logged_out=1");
    } catch {
      setSignOutError(language === "am" ? "መውጣት አልተጠናቀቀም። እንደገና ይሞክሩ።" : "Log out could not be completed. Please try again.");
      setSigningOut(false);
    }
  };

  const driveItems = NAV_ITEMS.filter((item) => item.group === "journeys");
  const supportItems = NAV_ITEMS.filter((item) => item.group === "assistance");

  const menuRows = (items: typeof NAV_ITEMS) =>
    items.map((item) => {
      const selected = active === item.id;
      const label = language === "am" ? item.am : item.en;
      const detail = language === "am" ? item.detail.am : item.detail.en;
      return (
        <Link
          key={item.id}
          href={item.href}
          className="nr-driver-menu-row"
          data-active={selected ? "true" : "false"}
          aria-current={selected ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          <span className="nr-driver-menu-row-icon" data-tone={item.id}><Icon name={item.icon} size={21} /></span>
          <span className="nr-driver-menu-row-copy"><strong>{label}</strong><small>{detail}</small></span>
          {selected ? <span className="nr-driver-menu-active-dot" aria-hidden="true" /> : <Icon name="chevron" size={16} />}
        </Link>
      );
    });

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
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

      {open && createPortal(
        <div className="nr-driver-menu-layer" data-theme={resolvedTheme} role="presentation">
          <button className="nr-driver-menu-backdrop" type="button" aria-label={language === "am" ? "ምናሌን ዝጋ" : "Close menu"} onClick={() => setOpen(false)} />
          <aside ref={panelRef} id="nr-driver-menu" className="nr-driver-menu-panel"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              panelTouchStart.current = touch ? {x:touch.clientX,y:touch.clientY} : null;
            }}
            onTouchEnd={(event) => {
              const start = panelTouchStart.current;
              panelTouchStart.current = null;
              const touch = event.changedTouches[0];
              if (!start || !touch) return;
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (dx < -72 && Math.abs(dx) > Math.abs(dy) * 1.4) setOpen(false);
            }}
            role="dialog" aria-modal="true" aria-labelledby="nr-driver-menu-title">
            <div className="nr-driver-menu-head">
              <div className="nr-driver-menu-brand-head">
                <img src="/brand/biloo-mark.svg" width={42} height={42} alt="" aria-hidden="true" />
                <div><small id="nr-driver-menu-title">BILOO · DRIVER</small><strong>{language === "am" ? "ይንዱ። ያግኙ። ያድጉ።" : "Drive. Earn. Grow."}</strong></div>
              </div>
              <button ref={closeRef} type="button" className="nr-driver-menu-close" onClick={() => setOpen(false)} aria-label={language === "am" ? "ዝጋ" : "Close"}>
                <Icon name="close" size={21} />
              </button>
            </div>
            <Link href="/driver/profile" className="biloo-menu-profile-card" onClick={() => setOpen(false)}>
              <span className="biloo-menu-profile-avatar">
                <span aria-hidden="true">{initials}</span>
                {portrait.url && <img src={portrait.url} alt="" width={62} height={62} decoding="async" onError={event => { event.currentTarget.style.display = 'none'; }}/>} 
              </span>
              <span className="biloo-menu-profile-copy">
                <span className="nr-driver-profile-heading">
                  <strong>{portrait.name || (language === "am" ? "የእኔ መገለጫ" : "My profile")}</strong>
                  {driverPresence && <span className="nr-driver-menu-status" data-online={driverPresence.online ? "true" : "false"}><span aria-hidden="true" />{driverPresence.online ? (language === "am" ? "በመስመር ላይ" : "Online") : (language === "am" ? "ከመስመር ውጭ" : "Offline")}</span>}
                </span>
                <small>{language === "am" ? "መገለጫ እና የመለያ ቅንብሮች" : "View account & edit photo"}</small>
                {driverPresence?.rating != null && <span className="nr-driver-menu-rating"><Icon name="star" size={13} />{driverPresence.rating.toFixed(1)}</span>}
              </span>
              <Icon name="chevron" size={18}/>
            </Link>


            <div className="nr-menu-scroll" data-testid="driver-menu-scroll">
              <nav className="nr-driver-menu-nav" aria-label={language === "am" ? "የመንዳት አሰሳ" : "Drive navigation"}>
                {menuRows(driveItems)}
              </nav>
              <div className="nr-driver-menu-separator" aria-hidden="true" />
              <nav className="nr-driver-menu-nav" aria-label={language === "am" ? "ድጋፍ እና ደህንነት" : "Help and safety"}>
                {menuRows(supportItems)}
              </nav>
              <div className="nr-driver-menu-secondary">
                <Link href="/rider" className="nr-driver-menu-role-switch" onClick={() => setOpen(false)} aria-label={language === "am" ? "ወደ Biloo ተሳፋሪ ቀይር" : "Switch to Biloo Rider"}>
                  <Icon name="users" size={20}/>
                  <span><strong>{language === "am" ? "በBiloo ይጓዙ" : "Ride with Biloo"}</strong><small>{language === "am" ? "የተሳፋሪ ገጽን ይክፈቱ" : "Open Rider experience"}</small></span>
                  <Icon name="chevron" size={16}/>
                </Link>
              </div>
            </div>

            <footer className="nr-driver-menu-footer" aria-label={language === "am" ? "የመተግበሪያ መረጃ" : "App information"}>
              <AppVersion />
            </footer>
          </aside>
        </div>, document.body
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
  if (pathname.startsWith("/driver/activity")) return say("Activity", "እንቅስቃሴ");
  if (pathname === "/driver/map") return say("Live map", "ቀጥታ ካርታ");
  if (pathname.startsWith("/driver/navigation")) return say("Trip navigation", "የጉዞ አቅጣጫ");
  if (pathname.startsWith("/driver/pickup")) return say("Pickup", "መነሻ");
  if (pathname.startsWith("/driver/profile/documents")) return say("Documents", "ሰነዶች");
  if (pathname.startsWith("/driver/profile/vehicle")) return say("Vehicle", "ተሽከርካሪ");
  if (pathname.startsWith("/driver/profile/payouts")) return say("Payouts", "ክፍያዎች");
  if (pathname.startsWith("/driver/profile/settings")) return say("Settings", "ቅንብሮች");
  if (pathname.startsWith("/driver/profile")) return say("Account", "መለያ");
  return language === "am" ? "Biloo አሽከርካሪ" : "Biloo Driver";
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

export function DriverThemeSelector() { return <AppearanceSelector role="driver"/>; }

function DriverHeader({
  pathname,
  menuOpen,
  onMenuOpenChange,
}: {
  pathname: string;
  menuOpen: boolean;
  onMenuOpenChange: (nextOpen: boolean) => void;
}) {
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
        <DriverHamburgerMenu controlledOpen={menuOpen} onOpenChange={onMenuOpenChange} />
      </div>
    );
  }

  return (
    <header className="nr-driver-global-header" data-map={isTripFocusPath(pathname) ? "true" : "false"}>
      <div className="nr-driver-global-header-inner">
        <div className="nr-driver-global-header-side nr-driver-global-header-left">
          <DriverHamburgerMenu controlledOpen={menuOpen} onOpenChange={onMenuOpenChange} />
          {backTarget && (
            <button type="button" className="nr-driver-global-icon-button nr-driver-header-back" onClick={() => router.push(backTarget)} aria-label={language === "am" ? "ተመለስ" : "Back"}>
              <Icon name="back" size={19} />
            </button>
          )}
        </div>

        <div className="nr-driver-global-header-title">
          {home ? (
            <>
              <strong>Biloo</strong>
              <span>{language === "am" ? "አሽከርካሪ" : "Driver"}</span>
            </>
          ) : (
            <>
              <span className="biloo-driver-header-eyebrow"><img src="/brand/biloo-mark.svg" width={19} height={19} alt="" aria-hidden="true" />{language === "am" ? "BILOO · አሽከርካሪ" : "BILOO · DRIVER"}</span>
              <strong>{title}</strong>
            </>
          )}
          {!online && <em>{language === "am" ? "ከመስመር ውጭ" : "Offline"}</em>}
        </div>

        <div className="nr-driver-global-header-side nr-driver-global-header-right">
          <span className="nr-driver-global-header-spacer" aria-hidden="true" />
        </div>
      </div>
    </header>
  );
}

function DriverShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { preference, resolvedTheme } = useDriverTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockedByLogout, setBlockedByLogout] = useState(false);
  const isPublic = isPublicDriverPath(pathname);

  // Route changes should never leave a new Driver page with hidden wrappers.
  useEffect(() => { setMenuOpen(false); }, [pathname]);

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
    <div className="nr-driver-app-shell" data-theme={resolvedTheme} data-theme-preference={preference} data-trip-focus={tripFocus ? "true" : "false"} data-home={home ? "true" : "false"} data-request-map={pathname.startsWith("/driver/request") ? "true" : "false"} data-driver-menu-open={menuOpen ? "true" : "false"}>
      <DriverHeader pathname={pathname} menuOpen={menuOpen} onMenuOpenChange={setMenuOpen} />
      <DriverSessionBridge />
      <DriverCancellationNotice pathname={pathname} />
      <div className="nr-driver-shell-content" data-trip-focus={tripFocus ? "true" : "false"}>{children}</div>
    </div>
  );
}

export function DriverAppShell({ children }: { children: ReactNode }) {
  return <DriverThemeProvider><DriverShellChrome>{children}</DriverShellChrome></DriverThemeProvider>;
}

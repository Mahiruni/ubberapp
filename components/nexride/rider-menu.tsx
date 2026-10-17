"use client";

import { createPortal } from "react-dom";
import { AppVersion } from "./app-version";
import { MenuGroup } from "./menu-group";
import { registerNexRideBackHandler } from "../../lib/nexride-native-navigation";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  PREVIEW_ENABLED_KEY,
  PREVIEW_STORAGE_KEY,
  retryStartup,
} from "../../lib/nexride-startup";
import { signOutNexRide } from "../../lib/nexride-sign-out";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { useAppearance } from "../../lib/nexride-appearance";
import { readAccount } from "../../lib/nexride-account";
import { supabase } from "../../lib/supabase";
import {
  Brand,
  Icon,
  LanguageContext,
  type IconName,
} from "./ui";

export type RiderMenuId =
  | "home"
  | "trips"
  | "wallet"
  | "saved"
  | "safety"
  | "messages"
  | "profile"
  | "settings";

type RiderTheme = "light" | "dark";

export function usePersistedRiderTheme(): RiderTheme {
  return useAppearance("rider").resolvedTheme;
}

const hrefs: Record<RiderMenuId, string> = {
  home: "/",
  trips: "/rider/trips",
  wallet: "/rider/wallet",
  saved: "/?screen=saved",
  safety: "/safety?role=rider",
  messages: "/support?role=rider",
  profile: "/?screen=profile",
  settings: "/?screen=profile&panel=settings",
};

export function RiderMenu({
  active = "home",
  onNavigate,
  onSettings,
  isAdmin: adminOverride,
  className = "",
  locked = false,
}: {
  active?: RiderMenuId;
  onNavigate?: (id: RiderMenuId) => void;
  onSettings?: () => void;
  isAdmin?: boolean;
  className?: string;
  locked?: boolean;
}) {
  const { resolvedTheme } = useAppearance("rider");
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(Boolean(adminOverride));
  const [identity, setIdentity] = useState({name:"", avatar:""});
  const [hasSession, setHasSession] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerTouchStart = useRef<{x:number;y:number}|null>(null);

  useEffect(() => setIsAdmin(Boolean(adminOverride)), [adminOverride]);

  useEffect(() => {
    if (!open) return;
    let activeEffect = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!activeEffect) return;
      setHasSession(Boolean(data.session));
      if (data.session) {
        const account = await readAccount().catch(() => null);
        if (activeEffect) setIdentity({name:account?.profile.name || "",avatar:account?.avatar || ""});
      }
      if (!data.session || adminOverride !== undefined) return;
      const role = await resolveSessionRole(data.session).catch(() => "");
      if (activeEffect) setIsAdmin(role === "admin");
    }).catch(() => {
      if (activeEffect) setHasSession(false);
    });

    return () => {
      activeEffect = false;
    };
  }, [open, adminOverride]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const drawer = drawerRef.current;
    const selector =
      'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

    requestAnimationFrame(() => {
      drawer?.querySelector<HTMLElement>(selector)?.focus();
    });

    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(selector),
      ).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [open]);

  // Android system Back dismisses the drawer before navigating away.
  useEffect(() => {
    if (!open) return;
    return registerNexRideBackHandler(() => { setOpen(false); return true; }, 110);
  }, [open]);

  const items: {
    id: RiderMenuId;
    label: string;
    detail: string;
    icon: IconName;
  }[] = [
    {
      id: "home",
      label: say("Home", "መነሻ"),
      detail: say("Book a ride", "ጉዞ ይያዙ"),
      icon: "home",
    },
    {
      id: "trips",
      label: say("My rides", "ጉዞዎቼ"),
      detail: say("Trips and receipts", "ጉዞዎች እና ደረሰኞች"),
      icon: "clock",
    },
    {
      id: "wallet",
      label: say("Wallet & payments", "ቦርሳ እና ክፍያዎች"),
      detail: say("Payment methods and status", "የክፍያ መንገዶች እና ሁኔታ"),
      icon: "wallet",
    },
    {
      id: "saved",
      label: say("Saved places", "የተቀመጡ ቦታዎች"),
      detail: say("Home, work and favorites", "ቤት፣ ስራ እና ተወዳጆች"),
      icon: "star",
    },
    {
      id: "safety",
      label: say("Safety", "ደህንነት"),
      detail: say("Safety tools and trip sharing", "የደህንነት መሳሪያዎች"),
      icon: "shield",
    },
    {
      id: "messages",
      label: say("Support", "ድጋፍ"),
      detail: say("Help with rides and your account", "ለጉዞና መለያ እገዛ"),
      icon: "chat",
    },
    {
      id: "profile",
      label: say("Account", "መለያ"),
      detail: say("Your profile and personal details", "መገለጫዎ እና የግል ዝርዝሮች"),
      icon: "user",
    },
    {
      id: "settings",
      label: say("Settings", "ቅንብሮች"),
      detail: say("Appearance, language and preferences", "ገጽታ፣ ቋንቋ እና ምርጫዎች"),
      icon: "settings",
    },
  ];

  const navigate = (id: RiderMenuId) => {
    if (locked && !["safety", "messages"].includes(id)) return;
    setOpen(false);
    if (id === "settings" && onSettings) {
      onSettings();
      return;
    }
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    window.location.assign(hrefs[id]);
  };

  const renderRows = (subset: typeof items) => subset.map(item => {
    const selected = active === item.id;
    const disabled = locked && !["safety", "messages"].includes(item.id);
    return <button key={item.id} type="button" className={selected ? "active" : ""}
      aria-current={selected ? "page" : undefined} disabled={disabled}
      onClick={() => navigate(item.id)}>
      <span className="nr-rider-drawer-icon" data-tone={item.id}><Icon name={item.icon} size={20}/></span>
      <span><strong>{item.label}</strong><small>{item.detail}</small></span>
      {selected && <span className="nr-menu-active-dot" aria-hidden="true"/>}
    </button>;
  });

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");

    try {
      // The shared sign-out helper sets a persistent restoration barrier
      // BEFORE Supabase fires SIGNED_OUT or any in-flight auth callback.
      await signOutNexRide("rider");
      try {
        localStorage.removeItem(PREVIEW_ENABLED_KEY);
        localStorage.removeItem(PREVIEW_STORAGE_KEY);
        localStorage.removeItem("nexride-state");
      } catch {}
      retryStartup(true);
      setHasSession(false);
      setOpen(false);
      window.location.replace("/rider/sign-in?logged_out=1");
    } catch {
      setSignOutError(say("Log out could not be completed. Please try again.", "መውጣት አልተቻለም። እንደገና ይሞክሩ።"));
      setSigningOut(false);
    }
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
  };

  return (
    <div className="nr-rider-menu-root">
      <button
        ref={triggerRef}
        type="button"
        className={`nr-rider-hamburger ${className}`}
        data-open={open ? "true" : "false"}
        aria-label={open ? say("Close menu", "ምናሌ ዝጋ") : say("Open menu", "ምናሌ ክፈት")}
        aria-expanded={open}
        aria-controls="nr-rider-drawer"
        onClick={() => setOpen(value => !value)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="nr-rider-hamburger-line long" />
        <span className="nr-rider-hamburger-line long" />
        <span className="nr-rider-hamburger-line short" />
      </button>

      {open && createPortal(
        <div className="nr-rider-drawer-layer" data-theme={resolvedTheme}>
          <button
            className="nr-rider-drawer-backdrop"
            type="button"
            aria-label={say("Close menu", "ምናሌ ዝጋ")}
            onClick={() => setOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="nr-rider-drawer"
            className="nr-rider-drawer"
            onTouchStart={(event) => {
              const touch = event.touches[0];
              drawerTouchStart.current = touch ? {x:touch.clientX,y:touch.clientY} : null;
            }}
            onTouchEnd={(event) => {
              const start = drawerTouchStart.current;
              drawerTouchStart.current = null;
              const touch = event.changedTouches[0];
              if (!start || !touch) return;
              const dx = touch.clientX - start.x;
              const dy = touch.clientY - start.y;
              if (dx < -72 && Math.abs(dx) > Math.abs(dy) * 1.4) setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={say("Rider menu", "የተሳፋሪ ምናሌ")}
          >
            <header className="nr-rider-drawer-head">
              <Brand />
              <button
                type="button"
                className="nr-rider-drawer-close"
                aria-label={say("Close menu", "ምናሌ ዝጋ")}
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={19} />
              </button>
            </header>


            <button type="button" className="nr-menu-person" disabled={locked} onClick={() => navigate("profile")}><span className="nr-menu-person-avatar">{identity.avatar ? <img src={identity.avatar} alt="" onError={() => setIdentity(current => ({...current,avatar:""}))}/> : (identity.name.trim().split(/\s+/).slice(0,2).map(v=>v[0]).join("").toUpperCase() || <Icon name="user"/>)}</span><span className="nr-menu-person-copy"><strong>{identity.name || say("Welcome to NexRide", "እንኳን ወደ NexRide መጡ")}</strong><small>{say("View profile", "መገለጫ ይመልከቱ")}</small></span><Icon name="chevron" size={18}/></button>


            <div className="nr-menu-scroll" data-testid="rider-menu-scroll">
              <div className="nr-menu-section-label">{say("OVERVIEW", "አጠቃላይ")}</div>
              <nav className="nr-rider-drawer-nav" aria-label={say("Rider navigation", "የተሳፋሪ አሰሳ")}>
                {renderRows(items.slice(0,4))}
              </nav>
              <MenuGroup label={say("ACCOUNT & PREFERENCES", "መለያ እና ምርጫዎች")}
                icon="user" initiallyOpen active={active === "profile" || active === "settings"}>
                <nav className="nr-rider-drawer-nav nr-menu-nested" aria-label={say("Account and preferences", "መለያ እና ምርጫዎች")}>
                  {renderRows(items.slice(6,8))}
                </nav>
              </MenuGroup>
              <MenuGroup label={say("SAFETY & SUPPORT", "ደህንነት እና ድጋፍ")}
                icon="shield" active={active === "safety" || active === "messages"}>
                <nav className="nr-rider-drawer-nav nr-menu-nested" aria-label={say("Safety and support", "ደህንነት እና ድጋፍ")}>
                  {renderRows(items.slice(4,6))}
                </nav>
              </MenuGroup>
              <div className="nr-menu-section-label">{say("MORE", "ተጨማሪ")}</div>
              <div className="nr-rider-drawer-secondary">
                <button type="button" disabled={locked} onClick={() => {setOpen(false);window.location.assign("/driver");}}>
                  <Icon name="navigation" size={20}/>
                  <span><strong>{say("Drive with NexRide", "በNexRide ያሽከርክሩ")}</strong>
                  <small>{say("Open Driver", "የአሽከርካሪ ገጽ ይክፈቱ")}</small></span>
                  <Icon name="chevron" size={16}/>
                </button>
                {isAdmin && <button type="button" onClick={() => {setOpen(false);window.location.assign("/admin");}}>
                  <Icon name="shield" size={20}/>
                  <span><strong>Admin Control Center</strong><small>Operations and platform management</small></span>
                  <Icon name="chevron" size={16}/>
                </button>}
              </div>
            </div>

            <footer className="nr-rider-drawer-footer">
              <div className="nr-rider-drawer-footer-card">
                <div className="nr-rider-drawer-footer-brand">
                  <div>
                    <strong>NexRide</strong>
                    <small>{say("Better Rides. A Brighter Tomorrow.", "የተሻለ ጉዞ። ብሩህ ነገ።")}</small>
                    <AppVersion />
                  </div>
                </div>
                <button
                  type="button"
                  className="nr-rider-drawer-signout"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                >
                  <Icon name="power" size={18} />
                  <span>{signingOut ? say("Logging out…", "በመውጣት ላይ…") : say("Log out", "ውጣ")}</span>
                </button>
                {signOutError && <p role="alert">{signOutError}</p>}
                {!hasSession && !signOutError && (
                  <small className="nr-rider-drawer-footer-note">{say("Exit this local Rider session.", "ይህን የተሳፋሪ ክፍለ ጊዜ ይውጡ።")}</small>
                )}
              </div>
            </footer>
          </aside>
        </div>, document.body
      )}
    </div>
  );
}

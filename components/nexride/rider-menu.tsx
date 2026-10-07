"use client";

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
  markExplicitSignOut,
  retryStartup,
} from "../../lib/nexride-startup";
import { resolveSessionRole } from "../../lib/nexride-account-role";
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
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(Boolean(adminOverride));
  const [hasSession, setHasSession] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => setIsAdmin(Boolean(adminOverride)), [adminOverride]);

  useEffect(() => {
    if (!open) return;
    let activeEffect = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!activeEffect) return;
      setHasSession(Boolean(data.session));
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
      label: say("Activity", "እንቅስቃሴ"),
      detail: say("Trips and receipts", "ጉዞዎች እና ደረሰኞች"),
      icon: "clock",
    },
    {
      id: "wallet",
      label: say("Payments", "ክፍያዎች"),
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
  ];

  const navigate = (id: RiderMenuId) => {
    if (locked && !["safety", "messages"].includes(id)) return;
    setOpen(false);
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    window.location.assign(hrefs[id]);
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");

    try {
      const current = await supabase.auth.getSession();
      if (current.data.session) {
        const result = await supabase.auth.signOut({ scope: "local" });
        if (result.error) throw result.error;
        const verified = await supabase.auth.getSession();
        if (verified.error || verified.data.session) throw new Error("session_still_active");
      }

      markExplicitSignOut("rider");
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
        aria-label={say("Open menu", "ምናሌ ክፈት")}
        aria-expanded={open}
        aria-controls="nr-rider-drawer"
        onClick={() => setOpen(true)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="nr-rider-hamburger-line long" />
        <span className="nr-rider-hamburger-line long" />
        <span className="nr-rider-hamburger-line short" />
      </button>

      {open && (
        <div className="nr-rider-drawer-layer">
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


            <div className="nr-rider-drawer-section-label">{say("Your NexRide", "የእርስዎ NexRide")}</div>
            <nav
              className="nr-rider-drawer-nav"
              aria-label={say("Rider navigation", "የተሳፋሪ አሰሳ")}
            >
              {items.map((item) => {
                const selected = active === item.id;
                const disabled =
                  locked && !["safety", "messages"].includes(item.id);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={selected ? "active" : ""}
                    aria-current={selected ? "page" : undefined}
                    disabled={disabled}
                    onClick={() => navigate(item.id)}
                  >
                    <span className="nr-rider-drawer-icon">
                      <Icon name={item.icon} size={19} />
                    </span>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                );
              })}
            </nav>

            <div className="nr-rider-drawer-section-label nr-rider-drawer-section-label-secondary">{say("More", "ተጨማሪ")}</div>
            <div className="nr-rider-drawer-secondary">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  setOpen(false);
                  window.location.assign("/driver");
                }}
              >
                <Icon name="navigation" size={19} />
                <span>
                  <strong>{say("Drive with NexRide", "በNexRide ያሽከርክሩ")}</strong>
                  <small>{say("Open Driver", "የአሽከርካሪ ገጽ ይክፈቱ")}</small>
                </span>
                <Icon name="chevron" size={16} />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    window.location.assign("/admin");
                  }}
                >
                  <Icon name="shield" size={19} />
                  <span>
                    <strong>Admin Control Center</strong>
                    <small>Operations and platform management</small>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              )}
            </div>

            <footer className="nr-rider-drawer-footer">
              <div className="nr-rider-drawer-footer-card">
                <div className="nr-rider-drawer-footer-brand">
                  <span className="nr-rider-drawer-footer-mark" aria-hidden="true">N</span>
                  <div>
                    <strong>NexRide</strong>
                    <small>{say("Better Rides. A Brighter Tomorrow.", "የተሻለ ጉዞ። ብሩህ ነገ።")}</small>
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
        </div>
      )}
    </div>
  );
}

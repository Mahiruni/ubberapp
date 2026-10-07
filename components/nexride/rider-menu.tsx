"use client";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  LANGUAGE_KEY,
  PREVIEW_ENABLED_KEY,
  PREVIEW_STORAGE_KEY,
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
  const [identity, setIdentity] = useState({
    name: say("NexRide Rider", "NexRide ተሳፋሪ"),
    contact: "",
  });
  const [isAdmin, setIsAdmin] = useState(Boolean(adminOverride));
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);

  useEffect(() => setIsAdmin(Boolean(adminOverride)), [adminOverride]);

  useEffect(() => {
    if (!open) return;
    let activeEffect = true;

    try {
      const preview = JSON.parse(
        localStorage.getItem(PREVIEW_STORAGE_KEY) || "{}",
      ) as {
        profile?: { name?: unknown; phone?: unknown; email?: unknown };
      };
      const name =
        typeof preview.profile?.name === "string"
          ? preview.profile.name.trim()
          : "";
      const contact =
        typeof preview.profile?.phone === "string" &&
        preview.profile.phone.trim()
          ? preview.profile.phone.trim()
          : typeof preview.profile?.email === "string"
            ? preview.profile.email.trim()
            : "";
      if (name || contact) {
        setIdentity({
          name: name || say("NexRide Rider", "NexRide ተሳፋሪ"),
          contact,
        });
      }
    } catch {}

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!activeEffect || !data.session) return;
      const user = data.session.user;
      const meta = user.user_metadata || {};
      const name =
        (typeof meta.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta.name === "string" && meta.name.trim()) ||
        user.email?.split("@")[0] ||
        say("NexRide Rider", "NexRide ተሳፋሪ");
      setIdentity({
        name,
        contact: user.email || "",
      });
      if (adminOverride === undefined) {
        const role = await resolveSessionRole(data.session).catch(() => "");
        if (activeEffect) setIsAdmin(role === "admin");
      }
    });

    return () => {
      activeEffect = false;
    };
  }, [open, adminOverride, language]);

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
    {
      id: "profile",
      label: say("Account", "መለያ"),
      detail: say("Profile and personal information", "መገለጫ እና የግል መረጃ"),
      icon: "user",
    },
    {
      id: "settings",
      label: say("Settings", "ቅንብሮች"),
      detail: say("Language, appearance and alerts", "ቋንቋ፣ መልክ እና ማሳወቂያ"),
      icon: "settings",
    },
  ];

  const navigate = (id: RiderMenuId) => {
    if (
      locked &&
      !["safety", "messages", "profile"].includes(id)
    )
      return;
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

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const result = await supabase.auth.signOut({ scope: "local" });
      if (result.error) throw result.error;
      try {
        localStorage.removeItem(PREVIEW_ENABLED_KEY);
        localStorage.removeItem(PREVIEW_STORAGE_KEY);
        localStorage.removeItem("nexride-state");
        localStorage.removeItem(LANGUAGE_KEY);
      } catch {}
      retryStartup();
      window.location.replace("/rider/sign-in");
    } catch {
      setError(
        say(
          "Sign-out could not be confirmed. Please try again.",
          "ከመለያ መውጣት አልተረጋገጠም። እንደገና ይሞክሩ።",
        ),
      );
      setSigningOut(false);
    }
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const initials =
    identity.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "NR";

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

            <section className="nr-rider-drawer-profile">
              <span className="nr-rider-drawer-avatar">{initials}</span>
              <span>
                <strong>{identity.name}</strong>
                <small>
                  {identity.contact ||
                    say("Your NexRide account", "የNexRide መለያዎ")}
                </small>
              </span>
            </section>

            <nav
              className="nr-rider-drawer-nav"
              aria-label={say("Rider navigation", "የተሳፋሪ አሰሳ")}
            >
              {items.map((item) => {
                const selected = active === item.id;
                const disabled =
                  locked &&
                  !["safety", "messages", "profile"].includes(item.id);
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
              {error && <p role="alert">{error}</p>}
              <button
                type="button"
                className="nr-rider-drawer-signout"
                disabled={signingOut}
                aria-busy={signingOut || undefined}
                onClick={() => void signOut()}
              >
                <Icon name="power" size={18} />
                {signingOut
                  ? say("Signing out…", "በመውጣት ላይ…")
                  : say("Sign out", "ውጣ")}
              </button>
              <small>NexRide · Better Rides. A Brighter Tomorrow.</small>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

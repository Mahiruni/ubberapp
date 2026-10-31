"use client";

import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { registerNexRideBackHandler } from "../../lib/nexride-native-navigation";
import styles from "./rider-menu.module.css";

import {
  useContext,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { RIDER_NAVIGATION, type RiderNavigationId } from "../../lib/biloo-navigation-registry";
import { useAppearance } from "../../lib/nexride-appearance";
import { useSharedAccountPortrait } from "../../lib/nexride-shared-portrait";
import { supabase } from "../../lib/supabase";
import {
  Icon,
  LanguageContext,
} from "./ui";

export type RiderMenuId = RiderNavigationId | "profile";
type RiderTheme = "light" | "dark";

export function usePersistedRiderTheme(): RiderTheme {
  return useAppearance("rider").resolvedTheme;
}

export function RiderMenu({
  active = "home",
  onNavigate,
  isAdmin: adminOverride,
  className = "",
  locked = false,
}: {
  active?: RiderMenuId;
  onNavigate?: (id: RiderMenuId) => void;
  isAdmin?: boolean;
  className?: string;
  locked?: boolean;
}) {
  const router = useRouter();
  const { preference, resolvedTheme, setPreference, error: appearanceError } = useAppearance("rider");
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(Boolean(adminOverride));
  const portrait = useSharedAccountPortrait();
  const initials = portrait.name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase() || "BL";
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerTouchStart = useRef<{x:number;y:number}|null>(null);

  useEffect(() => setIsAdmin(Boolean(adminOverride)), [adminOverride]);

  useEffect(() => {
    if (!open) return;
    let activeEffect = true;

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!activeEffect) return;
      if (!data.session || adminOverride !== undefined) return;
      const role = await resolveSessionRole(data.session).catch(() => "");
      if (activeEffect) setIsAdmin(role === "admin");
    }).catch(() => {});

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

  const items = RIDER_NAVIGATION.map(entry => ({
    id: entry.id,
    label: language === "am" ? entry.label.am : entry.label.en,
    detail: language === "am" ? entry.detail.am : entry.detail.en,
    icon: entry.icon,
    group: entry.group,
  }));

  const navigate = (id: RiderMenuId) => {
    if (locked && !["safety", "messages"].includes(id)) return;
    setOpen(false);
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    const destination = RIDER_NAVIGATION.find(item => item.id === id);
    if (destination) router.push(destination.href);
    else if (id === "profile") router.push("/?screen=profile");
  };

  const renderRows = (subset: typeof items) => subset.map(item => {
    const selected = active === item.id;
    const disabled = locked && !["safety", "messages"].includes(item.id);
    return <button key={item.id} type="button" className={styles.row}
      aria-current={selected ? "page" : undefined} disabled={disabled}
      onClick={() => navigate(item.id)}>
      <span className={styles.icon}><Icon name={item.icon} size={20}/></span>
      <span className={styles.copy}><strong>{item.label}</strong><small>{item.detail}</small></span>
      <Icon name="chevron" size={17} />
    </button>;
  });

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
        <div className={styles.layer} data-theme={resolvedTheme}>
          <button
            className={styles.backdrop}
            type="button"
            tabIndex={-1}
            aria-label={say("Close menu", "ምናሌ ዝጋ")}
            onClick={() => setOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="nr-rider-drawer"
            className={styles.drawer}
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
            <header className={styles.header}>
              <div className={styles.brand}>
                <strong>BILOO</strong><small>{say("Rider", "ተሳፋሪ")}</small>
              </div>
              <button
                type="button"
                className={styles.close}
                aria-label={say("Close menu", "ምናሌ ዝጋ")}
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={19} />
              </button>
            </header>

            <div className={styles.scroll} data-testid="rider-menu-scroll">
              <button type="button" className="biloo-menu-profile-card" disabled={locked}
                onClick={() => navigate("profile")} aria-label={say("View my profile", "መገለጫዬን ይመልከቱ")}>
                <span className={styles.avatar}>
                  <span aria-hidden="true">{initials}</span>
                  {portrait.url && <img key={portrait.url} src={portrait.url} width={54} height={54} decoding="async" alt=""
                    onError={event => { event.currentTarget.style.display = "none"; }}/>}
                </span>
                <span className={styles.profileCopy}>
                  <strong>{portrait.name || say("My profile", "የእኔ መገለጫ")}</strong>
                  <small>{say("Rider account · Edit photo", "የተሳፋሪ መለያ · ፎቶ አርትዕ")}</small>
                </span>
                <Icon name="chevron" size={18}/>
              </button>

              <div className={styles.sectionLabel}>{say("MAIN NAVIGATION", "ዋና ምናሌ")}</div>
              <nav className={styles.nav} aria-label={say("Rider navigation", "የተሳፋሪ አሰሳ")}>
                {renderRows(items.filter(item => item.group === "journeys"))}
              </nav>
              <div className={styles.sectionLabel}>{say("SUPPORT & MORE", "ድጋፍ እና ተጨማሪ")}</div>
              <nav className={styles.nav} aria-label={say("Help and safety", "ድጋፍ እና ደህንነት")}>
                {renderRows(items.filter(item => item.group === "assistance"))}
              </nav>
              <div className={styles.secondary}>
                <button type="button" className={`${styles.row} ${styles.drive}`} disabled={locked} onClick={() => {setOpen(false);router.push("/driver");}}>
                  <span className={styles.icon}><Icon name="navigation" size={20}/></span>
                  <span className={styles.copy}><strong>{say("Drive with Biloo", "በBiloo ያሽከርክሩ")}</strong>
                  <small>{say("Open Driver", "የአሽከርካሪ ገጽ ይክፈቱ")}</small></span>
                  <Icon name="chevron" size={16}/>
                </button>
                {isAdmin && <button type="button" className={styles.row} onClick={() => {setOpen(false);router.push("/admin");}}>
                  <span className={styles.icon}><Icon name="users" size={20}/></span>
                  <span className={styles.copy}><strong>Admin Control Center</strong><small>Operations and platform management</small></span>
                  <Icon name="chevron" size={16}/>
                </button>}
              </div>
            </div>

            <footer className={styles.footer} aria-label={say("App information","የመተግበሪያ መረጃ")}>
              <span className={styles.credit}>Biloo — Proudly by<br/>Hisab Technologies PLC</span>
              <div className={styles.appearance} role="group" aria-label={say("Appearance", "ገጽታ")}>
                <button type="button" aria-label={say("Light theme", "ብርሃን ገጽታ")}
                  title={say("Light theme", "ብርሃን ገጽታ")} aria-pressed={preference === "light"} onClick={() => setPreference("light")}><Icon name="sun" size={18}/></button>
                <button type="button" aria-label={say("Dark theme", "ጨለማ ገጽታ")}
                  title={say("Dark theme", "ጨለማ ገጽታ")} aria-pressed={preference === "dark"} onClick={() => setPreference("dark")}><Icon name="moon" size={18}/></button>
                <button type="button" aria-label={say("Use device theme", "የመሣሪያ ገጽታ ተጠቀም")}
                  title={say("Use device theme", "የመሣሪያ ገጽታ ተጠቀም")} aria-pressed={preference === "system"} onClick={() => setPreference("system")}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></svg>
                </button>
              </div>
              {appearanceError && <small className={styles.appearanceError} role="alert">{say("Could not save appearance. Try again.", "ገጽታውን ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።")}</small>}
            </footer>
          </aside>
        </div>, document.body
      )}
    </div>
  );
}

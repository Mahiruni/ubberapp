"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { LanguageContext } from "./ui";
import { decideMobileRelease, nativeRoleFromPackage, parseMobileRelease, validBuild, type MobileRelease, type MobileRole } from "../../lib/nexride-mobile-release";

type NativeAppPlugin = {
  getInfo: () => Promise<{ id: string; build: string; version: string }>;
  addListener?: (event: string, handler: (state: { isActive?: boolean }) => void) => Promise<{ remove: () => Promise<void> }>;
};
type NativeUpdatePlugin = {
  startImmediateUpdate: () => Promise<unknown>;
  openStore: () => Promise<unknown>;
};
type NativeBridge = {
  getPlatform?: () => string;
  Plugins?: { App?: NativeAppPlugin; NexRideUpdates?: NativeUpdatePlugin };
};
type PendingUpdate = { role: MobileRole; release: MobileRelease; installedBuild: number };
const savedReleaseKey = (role: MobileRole) => "nexride:mobile-release:" + role;
const appliedRevisionKey = (role: MobileRole) => "nexride:applied-web-revision:" + role;
const liveRideStates = ["accepted", "arrived_pickup", "in_trip"];

/** Null is an unknown trip state: never interrupt someone whose trip cannot be verified. */
async function hasActiveTrip(role: MobileRole): Promise<boolean | null> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) return null;
    if (!auth.session) return false;
    const field = role === "rider" ? "rider_id" : "assigned_driver_id";
    const { data, error } = await supabase.from("ride_requests")
      .select("id").eq(field, auth.session.user.id).in("status", liveRideStates).limit(1);
    if (error) return null;
    return !!data?.length;
  } catch {
    return null;
  }
}

function safeToRefresh(path: string) {
  if (/^\/(auth|rider\/(sign-in|sign-up|onboarding)|driver\/(auth|onboarding)|safety|trip)(\/|$)/.test(path)) return false;
  return !document.querySelector("form");
}

export function NexRideMobileUpdateGate() {
  const language = useContext(LanguageContext);
  const pathname = usePathname() || "/";
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const checkBusy = useRef(false);
  const appRole = useRef<MobileRole | null>(null);
  const installed = useRef<number | null>(null);
  const bridgeRef = useRef<NativeBridge | null>(null);

  const check = useCallback(async () => {
    if (checkBusy.current) return;
    checkBusy.current = true;
    try {
      const bridge = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
      if (bridge?.getPlatform?.() !== "android" || !bridge.Plugins?.App?.getInfo) return;
      bridgeRef.current = bridge;
      const info = await bridge.Plugins.App.getInfo();
      const role = nativeRoleFromPackage(info.id);
      const currentBuild = validBuild(info.build);
      if (!role || currentBuild == null) return;
      appRole.current = role;
      installed.current = currentBuild;

      let policy: MobileRelease | null = null;
      try {
        const response = await fetch("/api/mobile/release?role=" + role, {
          cache: "no-store", credentials: "same-origin",
          headers: { "Accept": "application/json" },
        });
        if (!response.ok) throw new Error("Release service unavailable");
        policy = parseMobileRelease(await response.json(), role);
        if (!policy) throw new Error("Invalid release policy");
        try { localStorage.setItem(savedReleaseKey(role), JSON.stringify(policy)); } catch {}
      } catch {
        try { policy = parseMobileRelease(JSON.parse(localStorage.getItem(savedReleaseKey(role)) || "null"), role); } catch {}
      }
      if (!policy) return;

      const revisionKey = appliedRevisionKey(role);
      let earlier: string | null = null;
      try { earlier = sessionStorage.getItem(revisionKey); } catch {}
      const choice = decideMobileRelease(policy, currentBuild, earlier);
      if (choice === "native-update") {
        if (pathname.startsWith("/safety")) { setPending(null); return; }
        const active = await hasActiveTrip(role);
        if (active !== false) { setPending(null); return; }
        setPending({ role, release: policy, installedBuild: currentBuild });
        return;
      }

      setPending(null);
      if (choice === "web-refresh") {
        if (!safeToRefresh(pathname)) return;
        try { sessionStorage.setItem(revisionKey, policy.webRevision); } catch {}
        // Network-first service worker and a single reload per revision keep loops away.
        if ("serviceWorker" in navigator) {
          try { const registration = await navigator.serviceWorker.getRegistration(); await registration?.update(); } catch {}
        }
        window.location.reload();
        return;
      }
      if (!earlier) {
        try { sessionStorage.setItem(revisionKey, policy.webRevision); } catch {}
      }
    } finally {
      checkBusy.current = false;
    }
  }, [pathname]);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onMobileUpdate = () => void check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    window.addEventListener("nexride:check-updates", onMobileUpdate);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void check(), 5 * 60 * 1000);
    let listener: { remove: () => Promise<void> } | null = null;
    let unmounted = false;
    const registerNativeResume = async () => {
      const bridge = (window as Window & { Capacitor?: NativeBridge }).Capacitor;
      if (bridge?.getPlatform?.() !== "android" || !bridge.Plugins?.App?.addListener) return;
      try {
        const handle = await bridge.Plugins.App.addListener("appStateChange", (state) => { if (state.isActive) void check(); });
        if (unmounted) void handle.remove(); else listener = handle;
      } catch {}
    };
    void registerNativeResume();
    return () => {
      unmounted = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      window.removeEventListener("nexride:check-updates", onMobileUpdate);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      if (listener) void listener.remove();
    };
  }, [check]);

  useEffect(() => {
    if (!pending) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const button = document.getElementById("nexride-update-install");
    button?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [pending]);

  const startInstall = async () => {
    if (!pending || opening) return;
    setOpening(true);
    setNotice("");
    const plugin = bridgeRef.current?.Plugins?.NexRideUpdates;
    try {
      if (plugin?.startImmediateUpdate) {
        await plugin.startImmediateUpdate();
        setNotice(language === "am" ? "የGoogle Play ዝማኔን ይጨርሱ።" : "Finish installing the update through Google Play.");
        return;
      }
    } catch {
      // Not a Play-installed app or no immediate update available. Use the store.
    } finally { setOpening(false); }
    try {
      if (plugin?.openStore) await plugin.openStore();
      else window.location.assign(pending.release.storeUrl);
      setNotice(language === "am" ? "በGoogle Play ውስጥ አዲሱን ስሪት ይጫኑ።" : "Install the latest release in Google Play, then return to NexRide.");
    } catch {
      window.location.assign(pending.release.storeUrl);
    }
  };

  if (!pending || pathname.startsWith("/safety")) return null;
  const am = language === "am";
  return (
    <div className="nr-update-overlay" role="dialog" aria-modal="true" aria-labelledby="nr-update-title" aria-describedby="nr-update-description">
      <main className="nr-update-panel">
        <div className="nr-update-orbit" aria-hidden="true"><span>N</span></div>
        <p className="nr-update-eyebrow">NEXRIDE · {pending.role.toUpperCase()}</p>
        <h1 id="nr-update-title">{am ? "NexRide ተዘምኗል። ለመቀጠል ያዘምኑ።" : "NexRide has been updated. Update to continue."}</h1>
        <p id="nr-update-description">{am ? "ለደህንነትና ለተሻለ አገልግሎት የቅርብ ጊዜውን እትም ይጫኑ።" : "Get the latest secure experience, with smoother trips and improved reliability."}</p>
        <div className="nr-update-version" aria-label="Required Android update">
          <span>{am ? "የተጫነው ስሪት" : "Installed build"} <strong>{pending.installedBuild}</strong></span>
          <span className="nr-update-arrow" aria-hidden="true">→</span>
          <span>{am ? "የሚያስፈልግ ስሪት" : "Required build"} <strong>{pending.release.minimumBuild}</strong></span>
        </div>
        <button id="nexride-update-install" type="button" className="nr-update-install" onClick={() => void startInstall()} disabled={opening}>
          {opening ? (am ? "በመክፈት ላይ…" : "Opening Google Play…") : (am ? "አዘምን እና ጫን" : "Update & Install")}
          <span aria-hidden="true">↗</span>
        </button>
        {notice && <p className="nr-update-notice" role="status">{notice}</p>}
        <p className="nr-update-footnote">{am ? "መረጃዎና መለያዎ ይጠበቃሉ።" : "Your account, settings and trip history stay protected."}</p>
        <a className="nr-update-safety" href={"/safety?role=" + pending.role}>{am ? "የአደጋ እርዳታ እና ደህንነት" : "Emergency & safety access"}</a>
      </main>
    </div>
  );
}

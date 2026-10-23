"use client";
import { useAppearance } from "../lib/nexride-appearance";
import type { TripSnapshot } from "../lib/nexride-trip-data";
import Image from "next/image";
import dynamic from "next/dynamic";
import type { RiderScreen } from "../components/nexride/rider";

import { useRouter } from "next/navigation";
import { RiderSplash } from "../components/nexride/splash";
import {
  completedStartup,
  initializeRider,
  retryStartup,
  StartupError,
  PREVIEW_STORAGE_KEY,
  LANGUAGE_KEY,
  updateStartupPreferences,
  storedLanguage,
} from "../lib/nexride-startup";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brand,
  Button,
  Dialog,
  Icon,
  InputField,
  LanguageContext,
  ListRow,
  Navigation,
  Sheet,
  StatusBanner,
  useTranslation,
  type IconName,
} from "../components/nexride/ui";

import { useMatching } from "../lib/nexride-use-matching";
import { useJourney } from "../lib/nexride-journey";
import { useRiderLocation } from "../lib/nexride-location";

import { RiderMenu, type RiderMenuId } from "../components/nexride/rider-menu";
import type { DriverScreen } from "../components/nexride/driver";
import type { Language } from "../lib/nexride-i18n";
import { LANGUAGE_EVENT } from "../components/nexride/language-provider";
import type { PreviewProfile, PreviewTrip } from "../lib/nexride-preview";
import { resolveSessionRole } from "../lib/nexride-account-role";
import { invalidateRiderAccountCache, readAccount } from "../lib/nexride-account";
import { registerNexRideBackHandler } from "../lib/nexride-native-navigation";
import "./nexride.css";
import "./rider-home.css";
import "./destination.css";
import "./ride-selection.css";
import "./matching.css";
import "./rider-flow.css";
import "./rider-profile.css";
import "./detail-system.css";
import "./rider-sheet-standard.css";
import "./wrapper-polish.css";
import "./precision-rider.css";
import "./nexride-2026-tokens.css";
import "./biloo-home-clean.css";
// Only load the map engine or settings screens when they are actually rendered.
// This keeps Mapbox/geocoder and profile tooling out of unrelated initial bundles.
const RiderMap = dynamic(() => import("../components/nexride/rider-map").then(mod => mod.RiderMap), {
  ssr: false,
  loading: () => <div className="biloo-map-preparing" role="status" aria-label="Preparing your map" />,
});
const RiderWorkspace = dynamic(() => import("../components/nexride/rider").then(mod => mod.RiderWorkspace), { ssr: false });
const DriverWorkspace = dynamic(() => import("../components/nexride/driver").then(mod => mod.DriverWorkspace), { ssr: false });
const RiderProfile = dynamic(() => import("../components/nexride/rider-profile").then(mod => mod.RiderProfile), { ssr: false });
const RiderSettings = dynamic(() => import("../components/nexride/rider-profile").then(mod => mod.RiderSettings), { ssr: false });
const NexRideFeedbackSettings = dynamic(() => import("../components/nexride/feedback-settings").then(mod => mod.NexRideFeedbackSettings), { ssr: false });

const STORAGE_KEY = PREVIEW_STORAGE_KEY;
type Mode = "rider" | "driver";
type Panel =
  | "menu"
  | "personal"
  | "settings"
  | "safety"
  | "support"
  | "unavailable"
  | "reset"
  | null;
const emptyProfile = { name: "", phone: "", email: "" };
export default function Home() {
  const router = useRouter();
  const cached = completedStartup();
  const [language, setLanguage] = useState<Language>(
    cached?.preferences.language || "en",
  );
  const [mode, setMode] = useState<Mode>(cached?.preferences.mode || "rider");
  const appearance = useAppearance("rider");
  const theme = appearance.resolvedTheme;
  const setTheme = appearance.setPreference;
  const [profile, setProfile] = useState<PreviewProfile>(
    cached?.preferences.profile || emptyProfile,
  );
  const [trip, setTrip] = useState<PreviewTrip | null>(
    cached?.preferences.trip || null,
  );
  const [ready, setReady] = useState(cached?.destination === "/");
  const [authenticated, setAuthenticated] = useState(Boolean(cached?.session));
  const [isAdmin, setIsAdmin] = useState(false);
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startupRouter = useRef(router);
  startupRouter.current = router;
  useEffect(() => {
    let active = true;
    try {
      setLanguage(storedLanguage(localStorage));
    } catch {}
    initializeRider()
      .then(async (result) => {
        const accountRole = result.session
          ? await resolveSessionRole(result.session).catch(() => "")
          : "";
        if (!active) return;
        const p = result.preferences;
        setAuthenticated(Boolean(result.session));
        setIsAdmin(accountRole === "admin");
        setLanguage(p.language);
        setMode(p.mode);
        setProfile(p.profile);
        setTrip(p.trip);
        if (result.destination !== "/") {
          startupRouter.current.replace(result.destination);
          return;
        }
        setReady(true);
      })
      .catch((error) => {
        if (active)
          setStartupError(
            error instanceof StartupError ? error : new StartupError("session"),
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = (reset = false) => {
    retryStartup(reset);
    setStartupError(null);
    setAttempt((v) => v + 1);
  };
  useEffect(() => {
    if (!ready) return;
    updateStartupPreferences({ language, mode, theme, profile, trip });
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ language, mode, theme, profile, trip }),
      );
    } catch {}
  }, [ready, language, mode, theme, profile, trip]);
  useEffect(() => {
    document.documentElement.lang = language;
    window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: language }));
  }, [language]);
  return (
    <LanguageContext value={language}>
      <main className="nr-app" data-mode={mode} data-theme={theme}>
        {ready ? (
          <AppWorkspace
            language={language}
            setLanguage={setLanguage}
            mode={mode}
            setMode={setMode}
            theme={theme}
            setTheme={setTheme}
            profile={profile}
            setProfile={setProfile}
            trip={trip}
            setTrip={setTrip}
            authenticated={authenticated}
            isAdmin={isAdmin}
            onReset={() => {
              setProfile(emptyProfile);
              setTrip(null);
              setMode("rider");
            }}
          />
        ) : (
          <RiderSplash
            error={startupError}
            onRetry={() => retry()}
            onReset={() => retry(true)}
            animate={attempt === 0}
          />
        )}
      </main>
    </LanguageContext>
  );
}
function AppWorkspace({
  language,
  setLanguage,
  mode,
  setMode,
  theme,
  setTheme,
  profile,
  setProfile,
  trip,
  setTrip,
  authenticated,
  isAdmin,
  onReset,
}: {
  language: Language;
  setLanguage: (l: Language) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  profile: PreviewProfile;
  setProfile: (p: PreviewProfile) => void;
  trip: PreviewTrip | null;
  setTrip: (t: PreviewTrip) => void;
  authenticated: boolean;
  isAdmin: boolean;
  onReset: () => void;
}) {
  const router = useRouter();
  const t = useTranslation();
  const [liveSnapshot, setLiveSnapshot] = useState<TripSnapshot | null>(null);
  const riderLocation = useRiderLocation();
  const journey = useJourney(riderLocation.position, language);
  const matching = useMatching();
  const bookingLock = useRef(false);
  const [requestPending, setRequestPending] = useState(false);
  const onBookingPending = useCallback((pending: boolean) => {
    bookingLock.current = pending;
    setRequestPending(pending);
  }, []);
  const [riderScreen, setRiderScreen] = useState<RiderScreen>("home");
  const [driverScreen, setDriverScreen] = useState<DriverScreen>("home");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("screen");
    if (
      requested === "profile" ||
      requested === "saved" ||
      requested === "wallet" ||
      requested === "trips"
    ) {
      setRiderScreen(requested as RiderScreen);
    }
    if (params.get("panel") === "settings") setPanel("settings");
  }, []);
  const [panel, setPanel] = useState<Panel>(null);
  const [serviceTitle, setServiceTitle] = useState("");
  const [toast, setToast] = useState("");
  const navigateRider = useCallback((s: RiderScreen) => {
    if (!bookingLock.current) setRiderScreen(s);
  }, []);
  const navigateDriver = useCallback(
    (s: DriverScreen) => setDriverScreen(s),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const announce = () => setToast(language === "am" ? "የጉዞዎ ሁኔታ ተዘምኗል። በጉዞዎቼ ውስጥ ይመልከቱ።" : "Your trip status changed. View it in My Rides.");
    window.addEventListener("nexride:trip-alert", announce);
    return () => window.removeEventListener("nexride:trip-alert", announce);
  }, [language]);
  const screen = mode === "rider" ? riderScreen : driverScreen;
  const profileView = screen === "profile";
  const [riderAvatar, setRiderAvatar] = useState<string | null>(null);
  const [riderAvatarFailed, setRiderAvatarFailed] = useState(false);
  const [riderAccountName, setRiderAccountName] = useState("");
  const avatarRefreshId = useRef(0);

  useEffect(() => {
    if (!authenticated || mode !== "rider") {
      avatarRefreshId.current += 1;
      setRiderAvatar(null);
      setRiderAccountName("");
      return;
    }
    let active = true;
    let lastRefresh = 0;
    const refreshAvatar = (force = false) => {
      // Focus events can fire repeatedly when returning from system dialogs.
      // Avoid redundant network reads for an unchanged photo.
      const now = Date.now();
      if (!force && now - lastRefresh < 45_000) return;
      lastRefresh = now;
      const requestId = ++avatarRefreshId.current;
      void readAccount().then(account => {
        if (!active || requestId !== avatarRefreshId.current) return;
        setRiderAvatar(account?.avatar ?? null);
        setRiderAccountName(account?.profile.name ?? "");
        setRiderAvatarFailed(false);
      }).catch(() => {
        // Keep the last good portrait during a temporary session/network failure.
      });
    };
    refreshAvatar(true);
    const onFocus = () => refreshAvatar();
    const onProfileChange = () => { invalidateRiderAccountCache(); refreshAvatar(true); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("nexride:profile-change", onProfileChange);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("nexride:profile-change", onProfileChange);
    };
  }, [authenticated, mode]);
  // Keep Android Back distinct from destructive cancellation/dispatch actions.
  useEffect(() => {
    if (mode !== "rider") return;
    return registerNexRideBackHandler(() => {
      if (requestPending || matching.active ||
        ["finding", "trip", "live"].includes(riderScreen)) {
        setToast(language === "am"
          ? "ጉዞዎ ቀጥሏል። እባክዎ የጉዞ መቆጣጠሪያዎችን ይጠቀሙ።"
          : "Your ride is still active. Use the ride controls to navigate safely.");
        return true;
      }
      const previous: Partial<Record<RiderScreen, RiderScreen>> = {
        destination: "home", rides: "destination", summary: "home",
        profile: "home", saved: "home", wallet: "home", trips: "home",
      };
      const target = previous[riderScreen];
      if (target) {
        setPanel(null);
        setRiderScreen(target);
        return true;
      }
      return false;
    }, 20);
  }, [mode, riderScreen, requestPending, matching.active, language]);

  const riderHome = mode === "rider" && screen === "home";
  const [liveTripShown, setLiveTripShown] = useState(false);
  const riderTripView = mode === "rider" && ["trip", "live", "summary"].includes(screen);
  const riderMapView =
    mode === "rider" &&
    ["home", "destination", "rides", "finding", "trip", "live", "summary"].includes(screen);
  const riderSearch = mode === "rider" && screen === "destination";
  const riderAssigned = mode === "rider" && screen === "trip";
  const riderLive = mode === "rider" && screen === "live";
  const riderSummary = mode === "rider" && screen === "summary";
  useEffect(() => {
    if (riderScreen === "rides" && !journey.canContinue)
      setRiderScreen("destination");
  }, [riderScreen, journey.canContinue]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [screen, mode]);
  const navItems: { id: string; label: string; icon: IconName }[] =
    mode === "rider"
      ? [
          { id: "home", label: t("home"), icon: "home" },
          { id: "trips", label: t("activity"), icon: "clock" },
          { id: "safety", label: t("safety"), icon: "shield" },
          { id: "messages", label: t("messages"), icon: "chat" },
          { id: "profile", label: t("account"), icon: "user" },
        ]
      : [
          { id: "home", label: t("home"), icon: "home" },
          { id: "request", label: t("requests"), icon: "navigation" },
          { id: "earnings", label: t("earnings"), icon: "money" },
          { id: "messages", label: t("messages"), icon: "chat" },
          { id: "profile", label: t("account"), icon: "user" },
        ];
  const navigate = (id: string) => {
    if (bookingLock.current && id !== "safety") return;
    if (mode === "rider" && id === "trips") {
      setPanel(null);
      router.push("/rider/trips");
      return;
    }
    if (mode === "rider" && id === "safety") {
      openSafety("rider");
      return;
    }
    if (mode === "rider" && id === "wallet") {
      setPanel(null);
      router.push("/rider/wallet");
      return;
    }
    if (mode === "rider" && id === "messages") {
      setPanel(null);
      router.push("/support");
      return;
    }
    if (mode === "driver" && id === "request") {
      setPanel(null);
      router.push("/driver/activity");
      return;
    }
    if (mode === "driver" && id === "messages") {
      setPanel(null);
      router.push("/support?role=driver");
      return;
    }
    if (mode === "rider") setRiderScreen(id as RiderScreen);
    else setDriverScreen(id as DriverScreen);
    setPanel(null);
  };
  const unavailable = (title: string) => {
    setServiceTitle(title);
    setPanel("unavailable");
  };
  const openSafety = (safetyRole: Mode = mode) => {
    setPanel(null);
    router.push(`/safety?role=${safetyRole}`);
  };
  const switchMode = (m: Mode) => {
    if (bookingLock.current) return;
    if (m === "driver") {
      router.push("/driver");
      return;
    }
    setMode("rider");
    setRiderScreen("home");
    setDriverScreen("home");
    setPanel(null);
  };
  const initials = profile.name
    ? profile.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "NR";
  const headerInitials = (riderAccountName || profile.name).trim()
    .split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "NR";
  return (
    <div
      data-keyboard={journey.viewport.keyboard}
      data-search-open={riderSearch && journey.searchOpen}
      data-request-pending={requestPending}
      style={
        riderSearch
          ? ({
              "--nr-search-height": `${journey.viewport.keyboard
                ? Math.max(280, (journey.viewport.height || 800) - 96)
                : Math.max(
                    110,
                    Math.min(
                      (journey.viewport.height || 800) * journey.sheetRatio,
                      (journey.viewport.height || 800) - 130,
                    ),
                  )}px`,
              "--nr-viewport-height": `${journey.viewport.height || 800}px`,
              "--nr-visual-offset-top": `${journey.viewport.offsetTop || 0}px`,
            } as React.CSSProperties)
          : undefined
      }
      className={`nr-workspace ${profileView && mode === "rider" ? "rider-profile-view" : ""} ${riderTripView ? "rider-trip-view" : ""} ${riderHome ? "rider-home-view" : ""} ${riderMapView ? "rider-map-flow nr-polished-wrapper" : ""} ${riderSearch ? "rider-search-view" : ""} ${mode === "rider" && screen === "rides" ? "rider-ride-view" : ""} ${mode === "rider" && screen === "finding" ? "rider-matching-view" : ""} ${riderAssigned ? "rider-assigned-view" : ""} ${riderLive ? "rider-live-view" : ""} ${riderSummary ? "rider-summary-view" : ""}`}
    >
      <aside className="nr-sidebar" inert={requestPending || matching.active}>
        <Brand driver={mode === "driver"} />
        <span className="nr-sidebar-city">
          <Icon name="pin" size={16} />
          {t("city")}
        </span>
        <div className="nr-mode-control" role="group" aria-label="Biloo">
          <button
            className={mode === "rider" ? "selected" : ""}
            onClick={() => switchMode("rider")}
          >
            {t("rider")}
          </button>
          <button
            className={mode === "driver" ? "selected" : ""}
            onClick={() => switchMode("driver")}
          >
            {t("driver")}
          </button>
        </div>
        <Navigation items={navItems} active={screen} onNavigate={navigate} />
        <div className="nr-sidebar-bottom">
          <button onClick={() => openSafety(mode)}>
            <Icon name="shield" />
            {t("safety")}
          </button>
          <button onClick={() => setPanel("settings")}>
            <Icon name="settings" />
            {t("settings")}
          </button>
          <button onClick={() => setLanguage(language === "en" ? "am" : "en")}>
            <Icon name="globe" />
            {language === "en" ? "አማርኛ" : "English"}
          </button>
          <button onClick={() => router.push("/discover")}>
            <Icon name="star" />
            Discover Biloo
          </button>
          {isAdmin && (
            <button onClick={() => router.push("/admin")}>
              <Icon name="shield" />
              Admin Control Center
            </button>
          )}
          <p>{t("brandTagline")}</p>
        </div>
      </aside>
      <section className="nr-main">
        <header className="nr-topbar">
          {mode === "rider" ? (
            !riderHome && (
              <RiderMenu
                className="nr-rider-hamburger-inline"
                active={riderScreen === "wallet" ? "wallet" : (["destination", "rides", "finding", "trip", "live", "summary"].includes(riderScreen) ? "home" : riderScreen) as RiderMenuId}
                onNavigate={(id) => navigate(id)}
                onSettings={() => setPanel("settings")}
                isAdmin={isAdmin}
                locked={requestPending || matching.active}
              />
            )
          ) : (
            <button className="nr-icon-button nr-mobile-menu" onClick={() => setPanel("menu")} aria-label={t("menu")}>
              <Icon name="menu" />
            </button>
          )}
          <Brand driver={mode === "driver"} />
          <div className="nr-topbar-place">
            <Icon name="pin" size={17} />
            <span>{t("city")}</span>
          </div>
          <div className="nr-topbar-actions">
            <button
              className="nr-language-button"
              onClick={() => setLanguage(language === "en" ? "am" : "en")}
            >
              <Icon name="globe" size={17} />
              <span>{language === "en" ? "አማርኛ" : "EN"}</span>
            </button>
            {mode === "rider" && (
              <button
                className="nr-avatar-button nr-rider-profile-top"
                aria-label={t("profile")}
                onClick={() => navigate("profile")}
              >
                {riderAvatar && !riderAvatarFailed
                  ? <Image src={riderAvatar} alt="" width={44} height={44} unoptimized
                      onError={() => setRiderAvatarFailed(true)} />
                  : headerInitials === "NR" ? <Icon name="user" size={20} /> : headerInitials}
              </button>
            )}
            {mode === "driver" && (
              <button
                className="nr-avatar-button"
                aria-label={t("profile")}
                onClick={() => navigate("profile")}
              >
                {initials}
              </button>
            )}
          </div>
        </header>
        {!authenticated && !liveTripShown && !profileView && <div className="nr-preview-banner">
          <span className="nr-preview-label">{t("preview")}</span>
          <p>{t("previewInfo")}</p>
          <button
            className="nr-icon-button"
            onClick={() => unavailable(t("preview"))}
            aria-label={t("details")}
          >
            <Icon name="info" size={17} />
          </button>
        </div>}
        <div
          className={`nr-stage ${["home", "destination", "rides", "finding", "trip", "live", "summary", "request", "navigation"].includes(screen) ? "with-map" : "content-view"}`}
        >
          {riderMapView ? (
            <RiderMap
              position={riderLocation.position}
              status={riderLocation.status}
              locate={riderLocation.locate}
              recenter={riderLocation.recenter}
              initials={initials}
              onProfile={() => navigate("profile")}
              showProfile={false}
              assignedTrip={['trip','live'].includes(screen) ? liveSnapshot : null}
              journey={
                ['trip','live'].includes(screen) && liveSnapshot
                  ? { ...journey, pinMode: null,
                      pickup: typeof liveSnapshot.pickup.lat === 'number' && typeof liveSnapshot.pickup.lng === 'number' ? { lat: liveSnapshot.pickup.lat, lng: liveSnapshot.pickup.lng, name: liveSnapshot.pickup.name || '', address: '', source: 'provider', confirmed: true } : journey.pickup,
                      destination: typeof liveSnapshot.destination.lat === 'number' && typeof liveSnapshot.destination.lng === 'number' ? { lat: liveSnapshot.destination.lat, lng: liveSnapshot.destination.lng, name: liveSnapshot.destination.name || '', address: '', source: 'provider', confirmed: true } : journey.destination }
                  : riderHome
                  ? undefined
                  : ["finding", "trip", "live"].includes(screen) && matching.request
                    ? { ...journey, ...matching.request.journey, pinMode: null }
                    : journey
              }
              readOnly={["finding", "trip", "live", "summary"].includes(screen)}
              searching={screen === 'finding' && !matching.connectionLost && ['searching', 'delayed'].includes(matching.snapshot?.status || 'searching')}
              rideLabel={["rides", "finding", "trip", "live", "summary"].includes(screen)}
              topLabel={authenticated ? t("city") : t("preview")}
              back={screen === "rides" ? () => navigate("destination") : undefined}
              locked={requestPending}
              showNearbyDrivers={
                authenticated &&
                mode === "rider" &&
                ["home", "destination", "rides", "finding"].includes(screen)
              }
              onStartRoute={
                screen === "destination" && journey.canContinue
                  ? () => navigate("rides")
                  : undefined
              }
            />
          ) : (
            <RiderMap
              position={riderLocation.position}
              status={riderLocation.status}
              locate={riderLocation.locate}
              recenter={riderLocation.recenter}
              initials={initials}
              onProfile={() => navigate("profile")}
              showProfile={false}
              readOnly
              locked={requestPending}
              showNearbyDrivers={authenticated && mode === "rider"}
              topLabel={mode === "driver" ? t("driver") : undefined}
            />
          )}
          <div className="nr-map-wordmark">
            <Brand driver={mode === "driver"} />
            <p>{t("brandMessage")}</p>
          </div>
          {!riderMapView && <div
            className="nr-panel"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onPointerCancel={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            {profileView && mode === "rider" ? <RiderProfile onAvatarSaved={(avatar) => {
              avatarRefreshId.current += 1;
              setRiderAvatar(avatar);
              setRiderAvatarFailed(false);
            }} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} profile={profile} setProfile={setProfile} rides={() => setRiderScreen("trips")} saved={() => setRiderScreen("saved")} payments={() => setRiderScreen("wallet")} safety={() => openSafety(mode)} support={() => router.push("/support")} switchDriver={() => switchMode("driver")} isAdmin={isAdmin} /> : profileView ? (
              <Sheet title={t("profile")}>
                <div className="nr-profile-header">
                  <div className="nr-avatar">{initials}</div>
                  <div>
                    <h2>{profile.name || t("guest")}</h2>
                    <p>
                      {t(mode === "driver" ? "sampleAccount" : "localAccount")}
                    </p>
                  </div>
                </div>
                <div className="nr-list">
                  <ListRow
                    icon="user"
                    title={t("personal")}
                    onClick={() => setPanel("personal")}
                  />
                  <ListRow
                    icon="clock"
                    title={t("trips")}
                    onClick={() =>
                      navigate(mode === "rider" ? "trips" : "history")
                    }
                  />
                  <ListRow
                    icon="wallet"
                    title={t(mode === "rider" ? "wallet" : "earnings")}
                    onClick={() =>
                      navigate(mode === "rider" ? "wallet" : "earnings")
                    }
                  />
                  <ListRow
                    icon="shield"
                    title={t("safety")}
                    onClick={() => openSafety(mode)}
                  />
                  <ListRow
                    icon="chat"
                    title={t("help")}
                    onClick={() => setPanel("support")}
                  />
                  <ListRow
                    icon="settings"
                    title={t("settings")}
                    onClick={() => setPanel("settings")}
                  />
                </div>
                <div className="nr-profile-language">
                  <span>{t("language")}</span>
                  <div className="nr-segmented">
                    <button
                      aria-pressed={language === "en"}
                      onClick={() => setLanguage("en")}
                    >
                      English
                    </button>
                    <button
                      aria-pressed={language === "am"}
                      onClick={() => setLanguage("am")}
                    >
                      አማርኛ
                    </button>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    switchMode(mode === "rider" ? "driver" : "rider")
                  }
                >
                  <Icon name="navigation" />
                  {t(mode === "rider" ? "switchDriver" : "switchRider")}
                </Button>
              </Sheet>
            ) : null}
            {mode === "rider" && !riderMapView && (
              <div hidden={profileView}>
                <RiderWorkspace
                  screen={riderScreen}
                  navigate={navigateRider}
                  onSafety={() => openSafety("rider")}
                  onUnavailable={unavailable}
                  trip={trip}
                  setTrip={setTrip}
                  position={riderLocation.position}
                  locationStatus={riderLocation.status}
                  locate={riderLocation.locate}
                  journey={journey}
                  onBookingPending={onBookingPending}
                  matching={matching}
                  onTripSource={setLiveTripShown}
                  onTripSnapshot={setLiveSnapshot}
                />
              </div>
            )}
            {mode === "driver" && (
              <div hidden={profileView}>
                <DriverWorkspace
                  screen={driverScreen}
                  navigate={navigateDriver}
                  onSafety={() => openSafety("driver")}
                />
              </div>
            )}
          </div>}
        </div>

        {riderHome && (
          <div className="biloo-home-floating-header" aria-label="Biloo home navigation">
            <RiderMenu
              className="biloo-home-floating-menu"
              active="home"
              onNavigate={(id) => navigate(id)}
              onSettings={() => setPanel("settings")}
              isAdmin={isAdmin}
              locked={requestPending || matching.active}
            />
            <Brand />
          </div>
        )}

        {mode === "rider" && riderMapView && (
          <div
            className={`nr-panel nr-rider-flow-panel ${riderHome ? "nr-home-panel-host" : ""}`}
            data-map-input-boundary="true"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onPointerCancel={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onTouchMove={(event) => event.stopPropagation()}
            onTouchEnd={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <div className="nr-rider-map-input-shield" aria-hidden="true" />
            <div
              className="nr-rider-persistent-wrapper"
              data-rider-screen={riderScreen}
            >
              <RiderWorkspace
                screen={riderScreen}
                navigate={navigateRider}
                onSafety={() => openSafety("rider")}
                onUnavailable={unavailable}
                trip={trip}
                setTrip={setTrip}
                position={riderLocation.position}
                locationStatus={riderLocation.status}
                locate={riderLocation.locate}
                journey={journey}
                onBookingPending={onBookingPending}
                matching={matching}
                onTripSource={setLiveTripShown}
                  onTripSnapshot={setLiveSnapshot}
              />
            </div>
          </div>
        )}

      </section>
      {toast && (
        <div className="nr-toast" role="status">
          <Icon name="check" />
          {toast}
        </div>
      )}
      {panel && (
        <Dialog
          title={
            panel === "unavailable"
              ? serviceTitle
              : t(
                  panel === "menu"
                    ? "profile"
                    : panel === "personal"
                      ? "personal"
                      : panel === "settings"
                        ? "settings"
                        : panel === "reset"
                          ? "clear"
                          : panel === "safety"
                            ? "safety"
                            : "help",
                )
          }
          onClose={() => setPanel(null)}
        >
          {panel === "menu" ? (
            <>
              <div className="nr-menu-profile">
                <div className="nr-avatar">{initials}</div>
                <div>
                  <strong>{profile.name || t("guest")}</strong>
                  <small>{isAdmin ? "Administrator" : t("localAccount")}</small>
                </div>
              </div>
              <div className="nr-list">
                {navItems.map((i) => (
                  <ListRow
                    key={i.id}
                    icon={i.icon}
                    title={i.label}
                    onClick={() => navigate(i.id)}
                  />
                ))}
                <ListRow
                  icon="shield"
                  title={t("safety")}
                  onClick={() => openSafety(mode)}
                />
                <ListRow
                  icon="settings"
                  title={t("settings")}
                  onClick={() => setPanel("settings")}
                />
                <ListRow
                  icon="star"
                  title="Discover Biloo"
                  onClick={() => router.push("/discover")}
                />
                {isAdmin && (
                  <ListRow
                    icon="shield"
                    title="Admin Control Center"
                    detail="Review drivers, documents & operations"
                    onClick={() => {
                      setPanel(null);
                      router.push("/admin");
                    }}
                  />
                )}
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  switchMode(mode === "rider" ? "driver" : "rider")
                }
              >
                {t(mode === "rider" ? "switchDriver" : "switchRider")}
              </Button>
            </>
          ) : panel === "personal" ? (
            <ProfileForm
              profile={profile}
              onSave={(p) => {
                setProfile(p);
                setPanel(null);
                setToast(t("saveSuccess"));
              }}
            />
          ) : panel === "settings" && mode === "rider" ? <RiderSettings language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme}/> : panel === "settings" ? (
            <>
              <div className="nr-settings-row">
                <strong>{t("language")}</strong>
                <div className="nr-segmented">
                  <button
                    aria-pressed={language === "en"}
                    onClick={() => setLanguage("en")}
                  >
                    English
                  </button>
                  <button
                    aria-pressed={language === "am"}
                    onClick={() => setLanguage("am")}
                  >
                    አማርኛ
                  </button>
                </div>
              </div>
              <NexRideFeedbackSettings role="driver" language={language} />
              <StatusBanner>{t("localAccount")}</StatusBanner>
              <Button variant="secondary" onClick={() => setPanel("reset")}>
                {t("clear")}
              </Button>
            </>
          ) : panel === "reset" ? (
            <>
              <p>{t("clearConfirm")}</p>
              <Button
                onClick={() => {
                  onReset();
                  setPanel(null);
                  setRiderScreen("home");
                  setDriverScreen("home");
                }}
              >
                {t("clear")}
              </Button>
            </>
          ) : panel === "safety" ? (
            <>
              <div className="nr-safety-symbol">
                <Icon name="shield" size={32} />
              </div>
              <h3>{t("safetyIntro")}</h3>
              <p>{t("safetyNote")}</p>
              <div className="nr-list">
                <ListRow
                  icon="share"
                  title={t("share")}
                  detail={t("unavailable")}
                  onClick={() => unavailable(t("share"))}
                />
                <ListRow
                  icon="chat"
                  title={t("help")}
                  detail={t("unavailable")}
                  onClick={() => setPanel("support")}
                />
              </div>
            </>
          ) : (
            <>
              <StatusBanner>{t("unavailable")}</StatusBanner>
              <p>
                {t(
                  panel === "support"
                    ? "supportNote"
                    : panel === "unavailable" && serviceTitle === t("preview")
                      ? "previewInfo"
                      : "connectNote",
                )}
              </p>
              <Button onClick={() => setPanel(null)}>{t("done")}</Button>
            </>
          )}
        </Dialog>
      )}
    </div>
  );
}
function ProfileForm({
  profile,
  onSave,
}: {
  profile: PreviewProfile;
  onSave: (p: PreviewProfile) => void;
}) {
  const t = useTranslation();
  const [form, setForm] = useState(profile);
  return (
    <form
      className="nr-profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
        });
      }}
    >
      <p className="nr-muted">{t("localAccount")}</p>
      <InputField
        label={t("name")}
        autoFocus
        required
        maxLength={80}
        autoComplete="name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <InputField
        label={t("phone")}
        type="tel"
        autoComplete="tel"
        placeholder="+251"
        maxLength={25}
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />
      <InputField
        label={t("email")}
        type="email"
        autoComplete="email"
        maxLength={254}
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <Button type="submit">{t("save")}</Button>
    </form>
  );
}

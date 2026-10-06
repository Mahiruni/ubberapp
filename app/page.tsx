"use client";
import Image from "next/image";
import { RiderProfile, RiderSettings } from "../components/nexride/rider-profile";
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
import { RideMap } from "../components/nexride/map";
import { RiderMap } from "../components/nexride/rider-map";
import { useMatching } from "../lib/nexride-use-matching";
import { useJourney } from "../lib/nexride-journey";
import { useRiderLocation } from "../lib/nexride-location";
import { RiderWorkspace, type RiderScreen } from "../components/nexride/rider";
import {
  DriverWorkspace,
  type DriverScreen,
} from "../components/nexride/driver";
import type { Language } from "../lib/nexride-i18n";
import type { PreviewProfile, PreviewTrip } from "../lib/nexride-preview";
import { resolveSessionRole } from "../lib/nexride-account-role";
import "./nexride.css";
import "./rider-home.css";
import "./destination.css";
import "./ride-selection.css";
import "./matching.css";
import "./rider-profile.css";
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
  const [theme, setTheme] = useState<"light" | "dark">(
    cached?.preferences.theme || "light",
  );
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
        setTheme(p.theme);
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
  const t = useTranslation();
  const riderLocation = useRiderLocation();
  const journey = useJourney(riderLocation.position);
  const matching = useMatching();
  const bookingLock = useRef(false);
  const [requestPending, setRequestPending] = useState(false);
  const onBookingPending = useCallback((pending: boolean) => {
    bookingLock.current = pending;
    setRequestPending(pending);
  }, []);
  const [riderScreen, setRiderScreen] = useState<RiderScreen>("home");
  const [driverScreen, setDriverScreen] = useState<DriverScreen>("home");
  const [panel, setPanel] = useState<Panel>(null);
  const [serviceTitle, setServiceTitle] = useState("");
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState("");
  const navigateRider = useCallback((s: RiderScreen) => {
    if (!bookingLock.current) setRiderScreen(s);
  }, []);
  const navigateDriver = useCallback(
    (s: DriverScreen) => setDriverScreen(s),
    [],
  );
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
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
  const riderHome = mode === "rider" && screen === "home";
  const [liveTripShown, setLiveTripShown] = useState(false);
  const riderTripView = mode === "rider" && ["trip", "live", "summary"].includes(screen);
  const riderMapView =
    mode === "rider" && ["home", "destination", "rides", "finding"].includes(screen);
  const riderSearch = mode === "rider" && screen === "destination";
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
          { id: "wallet", label: t("wallet"), icon: "wallet" },
          { id: "profile", label: t("profileNav"), icon: "user" },
        ]
      : [
          { id: "home", label: t("home"), icon: "home" },
          { id: "request", label: t("requests"), icon: "car" },
          { id: "earnings", label: t("earnings"), icon: "money" },
          { id: "profile", label: t("profile"), icon: "user" },
        ];
  const navigate = (id: string) => {
    if (bookingLock.current) return;
    if (mode === "rider" && id === "trips") {
      setPanel(null);
      window.location.assign("/rider/trips");
      return;
    }
    if (mode === "rider" && id === "wallet") {
      setPanel(null);
      window.location.assign("/rider/wallet");
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
    window.location.assign(`/safety?role=${safetyRole}`);
  };
  const switchMode = (m: Mode) => {
    if (bookingLock.current) return;
    if (m === "driver") {
      window.location.assign("/driver");
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
  return (
    <div
      data-keyboard={journey.viewport.keyboard}
      data-request-pending={requestPending}
      style={
        riderSearch
          ? ({
              "--nr-search-height": `${Math.max(110, Math.min((journey.viewport.height || 800) * journey.sheetRatio, (journey.viewport.height || 800) - 130))}px`,
              "--nr-viewport-height": `${journey.viewport.height || 800}px`,
            } as React.CSSProperties)
          : undefined
      }
      className={`nr-workspace ${profileView && mode === "rider" ? "rider-profile-view" : ""} ${riderTripView ? "rider-trip-view" : ""} ${riderMapView ? "rider-home-view" : ""} ${riderSearch ? "rider-search-view" : ""} ${mode === "rider" && screen === "rides" ? "rider-ride-view" : ""} ${mode === "rider" && ["finding", "trip", "live"].includes(screen) ? "rider-matching-view" : ""}`}
    >
      <aside className="nr-sidebar" inert={requestPending || matching.active}>
        <Brand driver={mode === "driver"} />
        <span className="nr-sidebar-city">
          <Icon name="pin" size={16} />
          {t("city")}
        </span>
        <div className="nr-mode-control" role="group" aria-label="NexRide">
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
          <button onClick={() => window.location.assign("/discover")}>
            <Icon name="star" />
            Discover NexRide
          </button>
          {isAdmin && (
            <button onClick={() => window.location.assign("/admin")}>
              <Icon name="shield" />
              Admin Control Center
            </button>
          )}
          <p>{t("brandTagline")}</p>
        </div>
      </aside>
      <section className="nr-main">
        <header className="nr-topbar">
          <button
            className="nr-icon-button nr-mobile-menu"
            onClick={() => setPanel("menu")}
            aria-label={t("menu")}
          >
            <Icon name="menu" />
          </button>
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
            <button
              className="nr-avatar-button"
              aria-label={t(mode === "rider" ? "profileNav" : "profile")}
              onClick={() => navigate("profile")}
            >
              {initials}
            </button>
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
        {offline && (
          <div className="nr-network-banner" role="status">
            {t("networkOffline")}
          </div>
        )}
        <div
          className={`nr-stage ${["home", "destination", "rides", "finding", "trip", "live", "request", "navigation"].includes(screen) ? "with-map" : "content-view"}`}
        >
          {riderTripView ? null : riderMapView ? (
            <RiderMap
              position={riderLocation.position}
              status={riderLocation.status}
              locate={riderLocation.locate}
              recenter={riderLocation.recenter}
              initials={initials}
              onProfile={() => navigate("profile")}
              journey={riderHome ? undefined : screen === 'finding' && matching.request ? { ...journey, ...matching.request.journey, pinMode: null } : journey}
              readOnly={["finding", "trip", "live"].includes(screen)}
              searching={screen === 'finding' && !matching.connectionLost && ['searching', 'delayed'].includes(matching.snapshot?.status || 'searching')}
              rideLabel={["rides", "finding", "trip", "live"].includes(screen)}
              back={screen === "rides" ? () => navigate("destination") : undefined}
              locked={requestPending}
            />
          ) : (
            <RideMap
              route={[
                "rides",
                "trip",
                "live",
                "request",
                "navigation",
              ].includes(screen)}
              driving={mode === "driver"}
            />
          )}
          <div className="nr-map-city">
            <Image
              src="/images/addis-skyline.webp"
              alt={t("city")}
              fill
              sizes="320px"
            />
            <div>
              <span>{t("city")}</span>
              <strong>{t("brandTagline")}</strong>
            </div>
          </div>
          <div className="nr-map-wordmark">
            <Brand driver={mode === "driver"} />
            <p>{t("brandMessage")}</p>
          </div>
          <div className="nr-panel">
            {profileView && mode === "rider" ? <RiderProfile language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} profile={profile} setProfile={setProfile} rides={() => setRiderScreen("trips")} payments={() => setRiderScreen("wallet")} safety={() => openSafety(mode)} support={() => window.location.assign("/support")} switchDriver={() => switchMode("driver")} /> : profileView ? (
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
                  <Icon name="car" />
                  {t(mode === "rider" ? "switchDriver" : "switchRider")}
                </Button>
              </Sheet>
            ) : null}
            {mode === "rider" && (
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
          </div>
        </div>
        <div className="nr-mobile-nav">
          <Navigation items={navItems} active={screen} onNavigate={navigate} />
        </div>
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
                  title="Discover NexRide"
                  onClick={() => window.location.assign("/discover")}
                />
                {isAdmin && (
                  <ListRow
                    icon="shield"
                    title="Admin Control Center"
                    detail="Review drivers, documents & operations"
                    onClick={() => {
                      setPanel(null);
                      window.location.assign("/admin");
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
              {mode === "rider" && (
                <div className="nr-settings-row">
                  <strong>{t("appearance")}</strong>
                  <div className="nr-segmented">
                    <button
                      aria-pressed={theme === "light"}
                      onClick={() => setTheme("light")}
                    >
                      {t("light")}
                    </button>
                    <button
                      aria-pressed={theme === "dark"}
                      onClick={() => setTheme("dark")}
                    >
                      {t("dark")}
                    </button>
                  </div>
                </div>
              )}
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

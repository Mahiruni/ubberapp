"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, LanguageContext } from "../../../../components/nexride/ui";
import { announceLanguage } from "../../../../components/nexride/language-provider";
import { DriverThemeSelector } from "../../../../components/nexride/driver-app-shell";
import { NEXRIDE_DRIVER_NAV_PROVIDER_KEY, isDriverNavigationProvider, readDriverNavigationProvider, type NexRideDriverNavigationProvider } from "../../../../lib/nexride-driver-navigation-provider";
import { supabase } from "../../../../lib/supabase";
import { loadDriverProfileData, type DriverProfileData } from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";
import "../../../detail-system.css";

export default function DriverProfileSettingsPage() {
  const router = useRouter();
  const language = useContext(LanguageContext);
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);
  const [navigationProvider, setNavigationProvider] = useState<NexRideDriverNavigationProvider>("google");

  useEffect(() => {
    setNavigationProvider(readDriverNavigationProvider());
    const onStorage = (event: StorageEvent) => {
      if (event.key === NEXRIDE_DRIVER_NAV_PROVIDER_KEY && isDriverNavigationProvider(event.newValue))
        setNavigationProvider(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const chooseNavigationProvider = (provider: NexRideDriverNavigationProvider) => {
    try {
      window.localStorage.setItem(NEXRIDE_DRIVER_NAV_PROVIDER_KEY, provider);
      setNavigationProvider(provider);
    } catch {
      setFeedback("Navigation preference could not be saved on this device.");
      setSuccess(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const next = await loadDriverProfileData(session.user.id);
      if (next.role !== "driver") {
        router.replace(next.role === "admin" ? "/admin" : "/");
        return;
      }

      if (!active) return;
      setProfile(next);
      setName(next.fullName);
      setPhone(next.phone);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setFeedback("We couldn’t load your profile settings.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || busy || profile.accountStatus !== "active") return;

    const cleanName = name.trim();

    if (!cleanName) {
      setSuccess(false);
      setFeedback("Enter your name before saving.");
      return;
    }

    setBusy(true);
    setFeedback("");
    setSuccess(false);

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: cleanName })
      .eq("id", profile.id);

    if (error) {
      setFeedback("We couldn’t save your changes. Try again.");
      setBusy(false);
      return;
    }

    await supabase.auth.updateUser({
      data: {
        full_name: cleanName,
      },
    });

    setProfile({ ...profile, fullName: cleanName });
    setSuccess(true);
    setFeedback("Profile updated.");
    setBusy(false);
  }

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label="Back to driver profile">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">NEXRIDE · DRIVER</span>
            <h1>Settings</h1>
            <p>Keep your contact details up to date.</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide" /><span className="panel" /></div>
        ) : profile ? (
          <>
            {profile.accountStatus !== "active" && (
              <div className="nr-profile-alert">
                <Icon name="info" size={17} />
                <span>Profile editing is limited while your account status is {profile.accountStatus}.</span>
              </div>
            )}

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Personal information</h2>
                  <p>Update your name here. Phone and email ownership changes require verification in Manage Account.</p>
                </div>
              </div>

              <form className="nr-profile-form" onSubmit={save}>
                <label>
                  Full name
                  <input
                    value={name}
                    maxLength={100}
                    autoComplete="name"
                    onChange={(event) => setName(event.target.value)}
                    disabled={profile.accountStatus !== "active"}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={phone}
                    maxLength={30}
                    type="tel"
                    autoComplete="tel"
                    readOnly
                    aria-describedby="nr-phone-verify-note"
                  />
                </label>
                <small id="nr-phone-verify-note">Your contact phone remains unchanged until you verify a replacement by SMS.</small>
                <button className="nr-doc-secondary" type="button" onClick={()=>router.push("/account/manage")}>
                  <Icon name="shield" size={16} /> Verify or change phone
                </button>
                <label>
                  Account email
                  <input value={profile.email || "Not available"} disabled aria-describedby="nr-email-note" />
                </label>
                <small id="nr-email-note">Email is your sign-in identity and cannot be changed here.</small>

                <button type="submit" disabled={busy || profile.accountStatus !== "active"}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </form>

              {feedback && (
                <div className={"nr-profile-alert " + (success ? "success" : "")} role={success ? "status" : "alert"}>
                  <Icon name={success ? "check" : "info"} size={17} />
                  <span>{feedback}</span>
                </div>
              )}
            </section>

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Driver preferences</h2>
                  <p>Choose the settings that make your Driver experience comfortable.</p>
                </div>
              </div>
              <div className="nr-driver-preference-block">
                <div className="nr-driver-preference-label">
                  <div><strong>Appearance</strong><small>Follow your phone or choose a fixed theme.</small></div>
                </div>
                <DriverThemeSelector />
              </div>
              <div className="nr-driver-preference-block">
                <div className="nr-driver-preference-label">
                  <div><strong>Language</strong><small>English uses NexRide Latin typography; Amharic uses the configured Ethiopic font.</small></div>
                </div>
                <div className="nr-driver-language-selector" role="group" aria-label="Driver language">
                  <button type="button" data-active={language === "en" ? "true" : "false"} aria-pressed={language === "en"} onClick={() => announceLanguage("en")}>English</button>
                  <button type="button" data-active={language === "am" ? "true" : "false"} aria-pressed={language === "am"} onClick={() => announceLanguage("am")}>አማርኛ</button>
                </div>
              </div>
              <div className="nr-driver-preference-block">
                <div className="nr-driver-preference-label">
                  <div>
                    <strong>Default navigation app</strong>
                    <small>Used when you open external turn-by-turn directions during an active trip. NexRide's live Mapbox route stays unchanged.</small>
                  </div>
                </div>
                <div className="nr-driver-navigation-provider" role="group" aria-label="External navigation provider">
                  <button type="button" data-active={navigationProvider === "google" ? "true" : "false"} aria-pressed={navigationProvider === "google"} onClick={() => chooseNavigationProvider("google")}>Google Maps</button>
                  <button type="button" data-active={navigationProvider === "waze" ? "true" : "false"} aria-pressed={navigationProvider === "waze"} onClick={() => chooseNavigationProvider("waze")}>Waze</button>
                </div>
                <small className="nr-driver-navigation-provider-note">If Waze has no coordinates for a stop, Google Maps is used as a safe fallback.</small>
              </div>
            </section>

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Verified information</h2>
                  <p>License, vehicle, and verification document changes require review.</p>
                </div>
              </div>
              <div className="nr-doc-actions">
                <button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/documents")}>
                  <Icon name="shield" size={16} /> Documents
                </button>
                <button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/vehicle")}>
                  <Icon name="pin" size={16} /> Vehicle
                </button>
              </div>
            </section>

            <div className="nr-profile-locked-note">
              <Icon name="shield" size={17} />
              <span>Your personal, verification, and financial details stay inside authenticated account areas.</span>
            </div>
          </>
        ) : (
          <section className="nr-profile-state-card" role="alert">
            <Icon name="info" size={22} />
            <strong>Settings unavailable</strong>
            <p>{feedback || "Profile settings could not be loaded."}</p>
          </section>
        )}
      </div>
    </main>
  );
}

"use client";

import { useOperationalTranslation } from "./operational-i18n";
import { DriverPhotoManager } from "./driver-photo-manager";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Icon, useTranslation, type IconName } from "./ui";
import { supabase } from "../../lib/supabase";
import { signOutNexRide } from "../../lib/nexride-sign-out";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { useDriverPortrait } from "../../lib/nexride-driver-portrait";
import { useDriverTheme } from "./driver-app-shell";
import {
  loadDriverProfileData,
  verificationSummary,
  initialsFor,
  type DriverProfileData,
} from "../../lib/nexride-driver-profile";
import styles from "./driver-profile.module.css";

export function DriverProfileScreen({
  driverId,
  onBack,
  onSafety,
}: {
  driverId: string;
  onBack: () => void;
  onSafety: () => void;
}) {
  const router = useRouter();
  const t = useTranslation();
  const say = useOperationalTranslation();
  const { resolvedTheme, setPreference } = useDriverTheme();
  const portrait = useDriverPortrait(driverId);
  const [failedPhoto, setFailedPhoto] = useState("");
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  const load = async () => {
    if (!driverId) return;
    setLoading(true);
    setError("");
    try {
      const data = await loadDriverProfileData(driverId);
      setProfile(data);
    } catch {
      setError(say("We couldn’t load your driver profile."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadDriverProfileData(driverId)
      .then((data) => active && setProfile(data))
      .catch(() => active && setError(say("We couldn’t load your driver profile.")))
      .finally(() => active && setLoading(false));

    const onFocus = () => {
      if (active) void loadDriverProfileData(driverId).then((data) => active && setProfile(data)).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [driverId]);

  if (loading) {
    return (
      <div className={styles.account} data-driver-account="" aria-busy="true">
        <div className={styles.loading} role="status" aria-label={say("Loading your account…")}><span/><span/><span/><span/></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <section className={styles.account} data-driver-account=""><div className={styles.state} role="alert">
        <Icon name="info" size={22} />
        <strong>{say("Profile unavailable")}</strong>
        <p>{error || say("Your driver profile could not be loaded.")}</p>
        <div className={styles.stateActions}>
          <button className={styles.primary} onClick={() => void load()}>{say("Retry")}</button>
          <button className={styles.secondary} onClick={onBack}>{say("Driver Home")}</button>
        </div>
      </div></section>
    );
  }

  const verification = verificationSummary(profile);
  const verified = verification.tone === "approved";

  async function signOutDriver() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");

    try {
      const activeRide = await supabase
        .from("ride_requests")
        .select("id,status")
        .eq("assigned_driver_id", driverId)
        .in("status", ["accepted", "arrived_pickup", "in_trip"])
        .limit(1)
        .maybeSingle();

      if (activeRide.error) {
        setSignOutError(say("Biloo could not verify your active-trip status. Try again before signing out."));
        return;
      }

      if (activeRide.data) {
        setSignOutError(say("Finish or cancel your active trip before signing out of the Driver app."));
        return;
      }

      const offlineResponse = await nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ online: false }),
      });
      if (!offlineResponse.ok && offlineResponse.status !== 409) {
        setSignOutError(say("Biloo could not take your driver account offline. Try again before signing out."));
        return;
      }

      await signOutNexRide("driver");
      setSignOutOpen(false);
      window.location.replace("/driver/auth?logged_out=1");
    } catch {
      setSignOutError(say("Sign out could not be completed. Please try again."));
    } finally {
      setSigningOut(false);
    }
  }

  const statusDetail =
    verification.tone === "approved"
      ? say("Your identity and vehicle documents are approved.")
      : say(verification.detail);

  const candidatePhoto = portrait.url || profile.avatarUrl;
  const photo = candidatePhoto !== failedPhoto ? candidatePhoto : "";
  const verificationAction = verified ? say("View documents") : profile.reviewStatus === "draft" ? say("Complete verification") : say("Review status");

  return (
    <div className={styles.account} data-driver-account="">
      <header className={styles.pageHead}>
        <div><span className={styles.eyebrow}>BILOO · {t("driver")}</span><h1>{say("Your account")}</h1></div>
        <div className={styles.appearance} role="group" aria-label={say("Display mode")}>
          <button type="button" aria-label={say("Day mode")} aria-pressed={resolvedTheme === "light"} onClick={() => setPreference("light")}><Icon name="sun" size={18}/></button>
          <button type="button" aria-label={say("Night mode")} aria-pressed={resolvedTheme === "dark"} onClick={() => setPreference("dark")}><Icon name="moon" size={18}/></button>
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.overview}>
          <section className={styles.identityCard} aria-label={say("Driver identity")}>
            <div className={styles.identityTop}>
              <span className={styles.sectionLabel}>{say("DRIVER PROFILE")}</span>
              <span className={styles.status} data-tone={verification.tone}>
                <Icon name={verified ? "check" : verification.tone === "restricted" || verification.tone === "rejected" ? "info" : "clock"} size={13}/>
                {say(verification.title)}
              </span>
            </div>
            <div className={styles.identity}>
              <div className={styles.portraitSlot}>
                <DriverPhotoManager driverId={driverId} fullName={profile.fullName}>
                  <span className={styles.avatar} aria-hidden="true">
                    {photo ? <img src={photo} alt="" width={72} height={72} decoding="async" onError={() => setFailedPhoto(photo)}/> : initialsFor(profile.fullName)}
                  </span>
                </DriverPhotoManager>
              </div>
              <div className={styles.identityCopy}>
                <h2>{profile.fullName}</h2>
                <p className={styles.email}>{profile.email || say("Biloo Driver account")}</p>
                <span className={styles.contact}><Icon name="phone" size={14}/>{profile.phone || say("Add a phone number")}</span>
              </div>
            </div>
            <div className={styles.identityBottom}>
              <span><Icon name="shield" size={13}/>{say("Driver account")}</span>
              <button type="button" onClick={() => router.push("/driver/profile/settings")}>{say("Edit details")}<Icon name="chevron" size={15}/></button>
            </div>
          </section>

          <section className={styles.metrics} aria-label={say("Driver summary")}>
            <ProfileMetric icon="star" label={say("Rating")} value={profile.rating === null ? "—" : profile.rating.toFixed(1)} suffix={profile.rating === null ? "" : "/ 5"}/>
            <ProfileMetric icon="navigation" label={say("Completed trips")} value={profile.completedTrips === null ? "—" : String(profile.completedTrips)}/>
          </section>

          <button type="button" className={styles.verification} data-tone={verification.tone} onClick={() => router.push("/driver/profile/documents")} aria-label={verificationAction}>
            <span className={styles.verificationIcon}><Icon name="shield" size={23}/></span>
            <span className={styles.verificationCopy}>
              <span className={styles.sectionLabel}>{say("DRIVER VERIFICATION")}</span>
              <strong>{say(verification.title)}</strong>
              <span className={styles.verificationDetail}>{statusDetail}</span>
              <span className={styles.verificationAction}>{verificationAction}<Icon name="arrow" size={15}/></span>
            </span>
          </button>

          {(profile.accountStatus !== "active" || profile.reviewStatus === "rejected") && <div className={styles.restriction} role="alert">
            <Icon name="info" size={18}/>
            <p>{profile.accountStatus !== "active" ? t("entryEditingLimited") : profile.rejectionReason || say("Replace the requested verification documents before going online.")}</p>
          </div>}
        </div>

        <div className={styles.sections} aria-label={say("Driver account options")}>
          <DriverSection title={say("Personal information")}>
            <DriverRow icon="lock" title={say("Account & security")} detail={say("Verified contacts, passwords and sessions")} onClick={() => router.push("/account/manage?role=driver#account-security")}/>
            <DriverRow icon="settings" title={say("Profile & app settings")} detail={say("Personal details, appearance, language and alerts")} onClick={() => router.push("/driver/profile/settings")}/>
          </DriverSection>

          <DriverSection title={say("Vehicle & payouts")}>
            <div className={styles.vehicle} role="group" aria-label={say("Your vehicle")}>
              <div><span className={styles.vehicleLabel}>{say("REGISTERED VEHICLE")}</span><strong>{profile.vehicle || say("Not provided")}</strong><small>{profile.vehicleColor || say("Not provided")}</small></div>
              <span className={styles.plate}>{profile.vehiclePlate || "—"}</span>
            </div>
            <DriverRow icon="pin" title={say("Vehicle management")} detail={say("Vehicle details and registration")} onClick={() => router.push("/driver/profile/vehicle")}/>
            <DriverRow icon="navigation" title={say("Map car avatar")} detail={say("Choose your Biloo finish")} onClick={() => router.push("/driver/profile/vehicle#map-avatar")}/>
            <DriverRow icon="wallet" title={say("Payout account")} detail={say("Manage your payout destination")} onClick={() => router.push("/driver/profile/payouts")}/>
          </DriverSection>

          <DriverSection title={say("Safety & information")}>
            <DriverRow icon="shield" title={say("Safety center")} detail={say("Safety tools and trip support")} onClick={onSafety}/>
            <DriverRow icon="lock" title={say("Privacy & data")} detail={say("Read how Biloo handles your information")} onClick={() => router.push("/explore/privacy")}/>
            <DriverRow icon="info" title={say("Terms & about Biloo")} detail={say("Service terms and information")} onClick={() => router.push("/explore/terms")}/>
          </DriverSection>
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.signOut} onClick={() => { setSignOutError(""); setSignOutOpen(true); }} disabled={signingOut}>
          <Icon name="power" size={18}/><span>{say("Sign out")}</span><Icon name="chevron" size={16}/>
        </button>
        <p className={styles.privacyNote}><Icon name="lock" size={13}/>{say("Your authenticated driver information stays private")}</p>
        <span className={styles.brandLine}>Biloo · {say("Proudly by Hisab Technologies PLC")}</span>
      </footer>

      {signOutOpen && <Dialog title={say("Sign out of Biloo?")} className={styles.dialog} fitViewport onClose={() => { if (!signingOut) { setSignOutOpen(false); setSignOutError(""); } }}>
        <div className={styles.dialogBody}>
          <span className={styles.signOutSymbol}><Icon name="power" size={24}/></span>
          <h3>{say("Sign out on this device?")}</h3>
          <p>{say("Biloo first checks that you have no active trip, then takes you offline and signs you out.")}</p>
          {signOutError && <div className={styles.error} role="alert"><Icon name="info" size={17}/><span>{signOutError}</span></div>}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondary} disabled={signingOut} onClick={() => { setSignOutOpen(false); setSignOutError(""); }}>{say("Stay signed in")}</button>
            <button type="button" className={styles.danger} disabled={signingOut} onClick={() => void signOutDriver()}>{signingOut ? say("Signing out…") : say("Sign out")}</button>
          </div>
        </div>
      </Dialog>}
    </div>
  );
}

function ProfileMetric({ icon, label, value, suffix = "" }: { icon: IconName; label: string; value: string; suffix?: string }) {
  return <div className={styles.metric} role="group" aria-label={label}>
    <div><span>{label}</span><Icon name={icon} size={16}/></div>
    <strong>{value}{suffix && <small>{suffix}</small>}</strong>
  </div>;
}

function DriverSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.section} aria-label={title}>
    <h2>{title}</h2><div className={styles.sectionCard}>{children}</div>
  </section>;
}

function DriverRow({ icon, title, detail, onClick }: { icon: IconName; title: string; detail: string; onClick: () => void }) {
  return <button type="button" className={styles.row} onClick={onClick}>
    <span className={styles.rowIcon} data-tone={icon}><Icon name={icon} size={20}/></span>
    <span className={styles.rowCopy}><strong>{title}</strong><small>{detail}</small></span>
    <Icon name="chevron" size={17}/>
  </button>;
}

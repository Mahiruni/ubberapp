"use client";

import { useOperationalTranslation } from "./operational-i18n";
import { DriverPhotoManager } from "./driver-photo-manager";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Icon, useTranslation, type IconName } from "./ui";
import { supabase } from "../../lib/supabase";
import { signOutNexRide } from "../../lib/nexride-sign-out";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import {
  loadDriverProfileData,
  verificationSummary,
  type DriverProfileData,
} from "../../lib/nexride-driver-profile";
import "../../app/driver/profile/profile.css";
import "../../app/detail-system.css";

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
      <div className="nr-driver-profile-loading nr-driver-profile-loading-v2" aria-busy="true">
        <span className="photo" />
        <span className="wide" />
        <span />
        <span className="panel" />
      </div>
    );
  }

  if (!profile) {
    return (
      <section className="nr-profile-state-card" role="alert">
        <Icon name="info" size={22} />
        <strong>{say("Profile unavailable")}</strong>
        <p>{error || say("Your driver profile could not be loaded.")}</p>
        <div className="nr-profile-state-actions">
          <button onClick={() => void load()}>{say("Retry")}</button>
          <button className="secondary" onClick={onBack}>{say("Driver Home")}</button>
        </div>
      </section>
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

  return (
    <div className="nr-driver-profile-v2">
      <header className="nr-driver-profile-heading">
        <div>
          <span className="nr-driver-kicker">{say("DRIVER WORKSPACE / 05")}</span>
          <h1>{say("Driver Account")}</h1>
          <p>{say("Your identity, verification and earnings.")}</p>
        </div>
        <button className="nr-driver-icon-btn" onClick={onBack} aria-label={say("Back to driver home")}>
          <Icon name="back" />
        </button>
      </header>

      <div className="biloo-driver-overview">
      <section className="nr-driver-profile-hero nr-driver-profile-hero-v2">
        <DriverPhotoManager driverId={driverId} fullName={profile.fullName}>
        <span className="nr-driver-profile-photo">
          <Icon name="user" size={28} />
          {verified && <i className="nr-driver-photo-badge"><Icon name="check" size={13}/></i>}
        </span>
        </DriverPhotoManager>

        <div className="nr-driver-profile-identity">
          <div className="nr-driver-role-line">
            <span className="nr-driver-profile-role">{t("driver")}</span>
            <span className={"nr-driver-verification-pill " + verification.tone}>
              <i />
              {say(verification.title)}
            </span>
          </div>
          <h2>{profile.fullName}</h2>
          <p>{profile.email || say("Biloo Driver account")}</p>
          <div className="nr-driver-contact-line">
            <span><Icon name="phone" size={14}/>{profile.phone || say("Add a phone number")}</span>
            {profile.vehiclePlate && <span><Icon name="pin" size={14}/>{profile.vehiclePlate}</span>}
          </div>
        </div>


      </section>

      {profile.accountStatus !== "active" && (
        <div className="nr-profile-restriction" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>{say("Account restriction")}</strong>
            <span>{t("entryEditingLimited")}</span>
          </div>
        </div>
      )}

      {profile.reviewStatus === "rejected" && (
        <div className="nr-profile-restriction rejected" role="alert">
          <Icon name="shield" size={18} />
          <div>
            <strong>{say("Documents need attention")}</strong>
            <span>{profile.rejectionReason || say("Replace the requested verification documents before going online.")}</span>
          </div>
        </div>
      )}

      <section className="nr-driver-profile-summary nr-driver-profile-summary-v2" aria-label={say("Driver summary")}>
        <ProfileMetric label={say("Rating")} value={profile.rating === null ? "—" : profile.rating.toFixed(1)} suffix={profile.rating === null ? "" : "★"} />
        <ProfileMetric label={say("Completed trips")} value={profile.completedTrips === null ? "—" : String(profile.completedTrips)} />
        <ProfileMetric label={say("Vehicle")} value={[profile.vehicle, profile.vehicleColor].filter(Boolean).join(" · ") || say("Not provided")} compact />
        <ProfileMetric label={say("Plate")} value={profile.vehiclePlate || say("Not provided")} compact />
      </section>

      <section className={"nr-driver-verification-card " + verification.tone}>
        <div className="nr-driver-verification-symbol"><Icon name="shield" size={23}/></div>
        <div>
          <span>{say("DRIVER VERIFICATION")}</span>
          <strong>{say(verification.title)}</strong>
          <p>{statusDetail}</p>
        </div>
        <button onClick={() => router.push("/driver/profile/documents")}>
          {verified ? say("View documents") : profile.reviewStatus === "draft" ? say("Complete verification") : say("Review status")}
          <Icon name="chevron" size={16}/>
        </button>
      </section>
      </div>

      <div className="nr-driver-profile-columns" aria-label={say("Driver account options")}>
        <div>
          <DriverSection title={say("Personal information")} subtitle={say("Your identity and contact information")}>
            <DriverRow icon="lock" title={say("Account & security")} detail={say("Verified contacts, passwords and sessions")} onClick={() => router.push("/account/manage?role=driver#account-security")}/>
          </DriverSection>

          <DriverSection title={say("Vehicle & payouts")} subtitle={say("Keep operating and settlement details current")}>
            <DriverRow icon="pin" title={say("Vehicle management")} detail={profile.vehiclePlate || profile.vehicle || say("Vehicle details and registration")} onClick={() => router.push("/driver/profile/vehicle")}/>
            <DriverRow icon="pin" title={say("Map car avatar")} detail={say("Choose your Biloo finish")} onClick={() => router.push("/driver/profile/vehicle#map-avatar")}/>
            <DriverRow icon="wallet" title={say("Payout account")} detail={say("Manage your payout destination")} onClick={() => router.push("/driver/profile/payouts")}/>
          </DriverSection>
        </div>

        <div>
          <DriverSection title={say("Preferences")} subtitle={say("Make Biloo work your way")}>
            <DriverRow icon="settings" title={say("Profile & app settings")} detail={say("Personal details, appearance, language and alerts")} onClick={() => router.push("/driver/profile/settings")}/>
            <DriverRow icon="shield" title={say("Privacy & data")} detail={say("Read how Biloo handles your information")} onClick={() => router.push("/explore/privacy")}/>
            <DriverRow icon="info" title={say("Terms & about Biloo")} detail={say("Service terms and information")} onClick={() => router.push("/explore/terms")}/>
          </DriverSection>
        </div>
      </div>

      {!profile.avatarUrl && (
        <p className="nr-profile-photo-note">
          {t('photoInstantNote')}
        </p>
      )}

      <footer className="nr-driver-profile-footer">
        <button
          className="nr-driver-profile-signout"
          onClick={() => {
            setSignOutError("");
            setSignOutOpen(true);
          }}
          disabled={signingOut}
        >
          <Icon name="power" size={18} />
          <span>{say("Sign out")}</span>
        </button>
        <p>{say("Your verified identity, vehicle, documents, and payout details are available only in authenticated driver areas.")}</p>
      </footer>

      {signOutOpen && (
        <Dialog
          title={say("Sign out of Biloo?")}
          onClose={() => {
            if (!signingOut) {
              setSignOutOpen(false);
              setSignOutError("");
            }
          }}
        >
          <div className="nr-driver-signout-intro">
            <span><Icon name="power" size={22}/></span>
            <div>
              <strong>{say("Sign out on this device?")}</strong>
              <p>{say("Biloo first checks that you have no active trip, then takes you offline and signs you out.")}</p>
            </div>
          </div>
          {signOutError && (
            <div className="nr-profile-alert" role="alert">
              <Icon name="info" size={17} />
              <span>{signOutError}</span>
            </div>
          )}
          <div className="nr-driver-signout-actions">
            <button type="button" className="secondary" disabled={signingOut} onClick={() => {setSignOutOpen(false);setSignOutError("");}}>
              Stay signed in
            </button>
            <button type="button" className="danger" disabled={signingOut} onClick={() => void signOutDriver()}>
              {signingOut ? say("Signing out…") : say("Sign out")}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ProfileMetric({ label, value, suffix = "", compact = false }: { label: string; value: string; suffix?: string; compact?: boolean }) {
  return (
    <div className={"nr-profile-metric" + (compact ? " compact" : "")}>
      <small>{label}</small>
      <strong>{value}{suffix && <span> {suffix}</span>}</strong>
    </div>
  );
}


function DriverSection({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <section className="nr-driver-profile-section">
    <header><h3>{title}</h3><p>{subtitle}</p></header>
    <div>{children}</div>
  </section>;
}

function DriverRow({icon,title,detail,onClick}:{icon:IconName;title:string;detail:string;onClick:()=>void}) {
  return <button className="nr-driver-profile-row" onClick={onClick}>
    <span className="nr-driver-profile-row-icon" data-tone={icon}><Icon name={icon} size={19}/></span>
    <span className="nr-driver-profile-row-copy"><strong>{title}</strong><small>{detail}</small></span>
    <Icon name="chevron" size={17}/>
  </button>;
}

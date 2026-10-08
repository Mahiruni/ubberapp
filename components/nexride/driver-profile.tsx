"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Icon, type IconName } from "./ui";
import { DRIVER_CORE_MENU_ITEMS } from "../../lib/nexride-driver-menu";
import { supabase } from "../../lib/supabase";
import { signOutNexRide } from "../../lib/nexride-sign-out";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import {
  initialsFor,
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
      setError("We couldn’t load your driver profile.");
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
      .catch(() => active && setError("We couldn’t load your driver profile."))
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
        <strong>Profile unavailable</strong>
        <p>{error || "Your driver profile could not be loaded."}</p>
        <div className="nr-profile-state-actions">
          <button onClick={() => void load()}>Retry</button>
          <button className="secondary" onClick={onBack}>Driver Home</button>
        </div>
      </section>
    );
  }

  const verification = verificationSummary(profile);
  const initials = initialsFor(profile.fullName);
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
        setSignOutError("NexRide could not verify your active-trip status. Try again before signing out.");
        return;
      }

      if (activeRide.data) {
        setSignOutError("Finish or cancel your active trip before signing out of the Driver app.");
        return;
      }

      const offlineResponse = await nexrideApiFetch("/api/driver/availability", {
        method: "PATCH",
        body: JSON.stringify({ online: false }),
      });
      if (!offlineResponse.ok && offlineResponse.status !== 409) {
        setSignOutError("NexRide could not take your driver account offline. Try again before signing out.");
        return;
      }

      await signOutNexRide("driver");
      setSignOutOpen(false);
      window.location.replace("/driver/auth?logged_out=1");
    } catch {
      setSignOutError("Sign out could not be completed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  const statusDetail =
    verification.tone === "approved"
      ? "Your identity and vehicle documents are approved."
      : verification.detail;

  return (
    <div className="nr-driver-profile-v2">
      <header className="nr-driver-profile-heading">
        <div>
          <span className="nr-driver-kicker">NEXRIDE · DRIVER ACCOUNT</span>
          <h1>Your driver account</h1>
          <p>Your profile, rating and six essential Driver tools.</p>
        </div>
        <button className="nr-driver-icon-btn" onClick={onBack} aria-label="Back to driver home">
          <Icon name="back" />
        </button>
      </header>

      <section className="nr-driver-profile-hero nr-driver-profile-hero-v2">
        <div className="nr-driver-profile-photo">
          {profile.avatarUrl ? (
            <Image src={profile.avatarUrl} alt={profile.fullName + " profile"} width={88} height={88} unoptimized />
          ) : (
            <span aria-label="Profile initials">{initials}</span>
          )}
          {verified && <i className="nr-driver-photo-badge"><Icon name="check" size={13}/></i>}
        </div>

        <div className="nr-driver-profile-identity">
          <div className="nr-driver-role-line">
            <span className="nr-driver-profile-role">DRIVER</span>
            <span className={"nr-driver-verification-pill " + verification.tone}>
              <i />
              {verification.title}
            </span>
          </div>
          <h2>{profile.fullName}</h2>
          <p>{profile.email || "NexRide Driver account"}</p>
          <div className="nr-driver-contact-line">
            <span><Icon name="phone" size={14}/>{profile.phone || "Add a phone number"}</span>
            {profile.vehiclePlate && <span><Icon name="pin" size={14}/>{profile.vehiclePlate}</span>}
          </div>
        </div>

        <button className="nr-driver-profile-edit" onClick={() => router.push("/driver/profile/settings")}>
          <Icon name="settings" size={16}/>
          Edit
        </button>
      </section>

      {profile.accountStatus !== "active" && (
        <div className="nr-profile-restriction" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>Account restriction</strong>
            <span>Your account status is {profile.accountStatus}. Driver availability and profile changes may be limited.</span>
          </div>
        </div>
      )}

      {profile.reviewStatus === "rejected" && (
        <div className="nr-profile-restriction rejected" role="alert">
          <Icon name="shield" size={18} />
          <div>
            <strong>Documents need attention</strong>
            <span>{profile.rejectionReason || "Replace the requested verification documents before going online."}</span>
          </div>
        </div>
      )}

      <section className="nr-driver-profile-summary nr-driver-profile-summary-v2" aria-label="Driver summary">
        <ProfileMetric label="Rating" value={profile.rating === null ? "—" : profile.rating.toFixed(1)} suffix={profile.rating === null ? "" : "★"} />
        <ProfileMetric label="Completed trips" value={profile.completedTrips === null ? "—" : String(profile.completedTrips)} />
        <ProfileMetric label="Vehicle" value={profile.vehicle || "Not provided"} compact />
        <ProfileMetric label="Plate" value={profile.vehiclePlate || "Not provided"} compact />
      </section>

      <section className={"nr-driver-verification-card " + verification.tone}>
        <div className="nr-driver-verification-symbol"><Icon name="shield" size={23}/></div>
        <div>
          <span>DRIVER VERIFICATION</span>
          <strong>{verification.title}</strong>
          <p>{statusDetail}</p>
        </div>
        <button onClick={() => router.push("/driver/profile/documents")}>
          {verified ? "View documents" : profile.reviewStatus === "draft" ? "Complete verification" : "Review status"}
          <Icon name="chevron" size={16}/>
        </button>
      </section>

      <div className="nr-driver-profile-columns nr-driver-profile-core-menu">
        <DriverSection title="Driver essentials" subtitle="Only the six essentials, without duplicate menus">
          {DRIVER_CORE_MENU_ITEMS.map((item) => (
            <DriverRow
              key={item.id}
              icon={item.icon}
              title={item.en}
              detail={item.detailEn}
              onClick={() => item.id === "safety" ? onSafety() : router.push(item.href)}
            />
          ))}
        </DriverSection>
      </div>

      {!profile.avatarUrl && (
        <p className="nr-profile-photo-note">
          Your initials are shown because no driver photo is currently connected to this account.
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
          <span>Sign out</span>
        </button>
        <p>Your verified identity, vehicle, documents, and payout details are available only in authenticated driver areas.</p>
      </footer>

      {signOutOpen && (
        <Dialog
          title="Sign out of NexRide?"
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
              <strong>Sign out on this device?</strong>
              <p>NexRide first checks that you have no active trip, then takes you offline and signs you out.</p>
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
              {signingOut ? "Signing out…" : "Sign out"}
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

function DriverRow({icon,title,detail,onClick}:{icon:IconName;title:string;detail:string;onClick:()=>void;key?:string}) {
  return <button className="nr-driver-profile-row" onClick={onClick}>
    <span className="nr-driver-profile-row-icon"><Icon name={icon} size={19}/></span>
    <span className="nr-driver-profile-row-copy"><strong>{title}</strong><small>{detail}</small></span>
    <Icon name="chevron" size={17}/>
  </button>;
}

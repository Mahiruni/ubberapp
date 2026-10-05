"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./ui";
import {
  initialsFor,
  loadDriverProfileData,
  verificationSummary,
  type DriverProfileData,
} from "../../lib/nexride-driver-profile";
import "../../app/driver/profile/profile.css";

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

  useEffect(() => {
    if (!driverId) return;
    let active = true;
    setLoading(true);
    setError("");

    loadDriverProfileData(driverId)
      .then((data) => active && setProfile(data))
      .catch(() => active && setError("NexRide could not load your driver profile."))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [driverId]);

  if (loading) {
    return (
      <div className="nr-driver-profile-loading" aria-busy="true">
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
        <button onClick={onBack}>Back to Driver Home</button>
      </section>
    );
  }

  const verification = verificationSummary(profile);
  const initials = initialsFor(profile.fullName);

  return (
    <>
      <header className="nr-driver-profile-heading">
        <div>
          <span className="nr-driver-kicker">NEXRIDE DRIVER</span>
          <h1>Profile</h1>
        </div>
        <button className="nr-driver-icon-btn" onClick={onBack} aria-label="Back to driver home">
          <Icon name="back" />
        </button>
      </header>

      <section className="nr-driver-profile-hero">
        <div className="nr-driver-profile-photo">
          {profile.avatarUrl ? (
            <img src={profile.avatarUrl} alt={profile.fullName + " profile"} />
          ) : (
            <span aria-label="No profile photograph available">{initials}</span>
          )}
        </div>
        <div className="nr-driver-profile-identity">
          <span className="nr-driver-profile-role">DRIVER</span>
          <h2>{profile.fullName}</h2>
          <p>{verification.title}</p>
        </div>
        <span className={"nr-profile-verification-dot " + verification.tone} aria-hidden="true" />
      </section>

      {profile.accountStatus !== "active" && (
        <div className="nr-profile-restriction" role="alert">
          <Icon name="info" size={18} />
          <div>
            <strong>Account restriction</strong>
            <span>Your account status is {profile.accountStatus}. Availability and profile changes may be limited.</span>
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

      <section className="nr-driver-profile-summary" aria-label="Driver summary">
        <ProfileMetric
          label="Rating"
          value={profile.rating === null ? "—" : profile.rating.toFixed(1)}
          suffix={profile.rating === null ? "" : "★"}
        />
        <ProfileMetric
          label="Trips"
          value={profile.completedTrips === null ? "—" : String(profile.completedTrips)}
        />
        <ProfileMetric
          label="Vehicle"
          value={profile.vehicle || "Not provided"}
          compact
        />
        <ProfileMetric
          label="Plate"
          value={profile.vehiclePlate || "Not provided"}
          compact
        />
      </section>

      {!profile.avatarUrl && (
        <p className="nr-profile-photo-note">
          No driver photograph is available in the current profile integration. NexRide uses your initials here rather than exposing an unrelated image.
        </p>
      )}

      <section className="nr-driver-profile-menu" aria-label="Driver profile options">
        <ProfileMenuRow
          icon="shield"
          title="Documents"
          detail={verification.title}
          onClick={() => router.push("/driver/profile/documents")}
        />
        <ProfileMenuRow
          icon="car"
          title="Vehicle"
          detail={profile.vehiclePlate || "Vehicle details"}
          onClick={() => router.push("/driver/profile/vehicle")}
        />
        <ProfileMenuRow
          icon="wallet"
          title="Payouts"
          detail="Earnings and payout status"
          onClick={() => router.push("/driver/profile/payouts")}
        />
        <ProfileMenuRow
          icon="settings"
          title="Settings"
          detail="Editable profile information"
          onClick={() => router.push("/driver/profile/settings")}
        />
      </section>

      <button className="nr-driver-profile-safety" onClick={onSafety}>
        <Icon name="shield" size={18} />
        <span>Safety Center</span>
        <Icon name="chevron" size={16} />
      </button>

      <p className="nr-driver-profile-privacy">
        Verified identity, document, vehicle, and financial information stays inside authenticated driver surfaces and is not added to trip sharing, public previews, or notification text.
      </p>
    </>
  );
}

function ProfileMetric({
  label,
  value,
  suffix = "",
  compact = false,
}: {
  label: string;
  value: string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div className={"nr-profile-metric" + (compact ? " compact" : "")}>
      <small>{label}</small>
      <strong>{value}{suffix && <span> {suffix}</span>}</strong>
    </div>
  );
}

function ProfileMenuRow({
  icon,
  title,
  detail,
  onClick,
}: {
  icon: "shield" | "car" | "wallet" | "settings";
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button className="nr-driver-profile-menu-row" onClick={onClick}>
      <span className="nr-profile-menu-icon"><Icon name={icon} size={19} /></span>
      <span className="nr-profile-menu-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <Icon name="chevron" size={17} />
    </button>
  );
}

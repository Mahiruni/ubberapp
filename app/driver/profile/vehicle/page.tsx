"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOperationalTranslation } from "../../../../components/nexride/operational-i18n";
import { Icon } from "../../../../components/nexride/ui";
import { supabase } from "../../../../lib/supabase";
import {
  loadDriverProfileData,
  verificationSummary,
  type DriverProfileData,
} from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";
import "../../../detail-system.css";

export default function DriverVehiclePage() {
  const router = useRouter();
  const say = useOperationalTranslation();
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!active) return;
      if (!data.session) {
        router.replace("/driver/auth");
        return;
      }

      try {
        const next = await loadDriverProfileData(data.session.user.id);
        if (next.role !== "driver") {
          router.replace(next.role === "admin" ? "/admin" : "/");
          return;
        }
        if (active) setProfile(next);
      } catch {
        if (active) setError(say("We couldn’t load your vehicle details."));
      } finally {
        if (active) setLoading(false);
      }
    })().catch(() => { if (active) { setError(say("We couldn’t load your vehicle details.")); setLoading(false); } });

    return () => {
      active = false;
    };
  }, [router]);

  const verification = profile ? verificationSummary(profile) : null;

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label={say("Back to driver profile")}>
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">NexRide · {say("Driver account")}</span>
            <h1>{say("Vehicle")}</h1>
            <p>{say("Your verified vehicle details.")}</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide" /><span className="panel" /></div>
        ) : profile ? (
          <>
            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>{profile.vehicle || say("Vehicle details incomplete")}</h2>
                  <p>{say(verification?.title || "Verification status unavailable")}</p>
                </div>
                <span className={"nr-doc-status " + (profile.reviewStatus === "approved" ? "approved" : profile.reviewStatus === "pending" ? "review" : profile.reviewStatus === "rejected" || profile.reviewStatus === "suspended" ? "danger" : "")}>
                  {profile.reviewStatus === "approved" ? say("Approved") : profile.reviewStatus === "pending" ? say("Under Review") : profile.reviewStatus === "rejected" ? say("Rejected") : profile.reviewStatus === "suspended" ? say("Restricted") : say("Incomplete")}
                </span>
              </div>

              <div className="nr-vehicle-detail-grid">
                <VehicleDetail label={say("Vehicle model")} value={profile.vehicle || say("Not provided")} />
                <VehicleDetail label={say("Vehicle color")} value={profile.vehicleColor || say("Not provided")} />
                <VehicleDetail label={say("License plate")} value={profile.vehiclePlate || say("Not provided")} />
                <VehicleDetail label={say("Driver license")} value={profile.licenseNumber ? say("On file") : say("Missing")} />
                <VehicleDetail label={say("Registration document")} value={profile.vehicleRegistrationPath ? say("On file") : say("Missing")} />
              </div>

              {profile.reviewStatus === "rejected" && (
                <div className="nr-profile-alert">
                  <Icon name="info" size={17} />
                  <span>{profile.rejectionReason || say("Your vehicle verification needs an update.")}</span>
                </div>
              )}

              <div className="nr-profile-locked-note">
                <Icon name="shield" size={17} />
                <span>{say("Vehicle and plate changes require verification because they can affect driver eligibility.")}</span>
              </div>
            </section>

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>{say("Need to update the vehicle?")}</h2>
                  <p>{say("Update registration documents and submit changes for review.")}</p>
                </div>
              </div>
              <div className="nr-doc-actions">
                <button className="nr-doc-primary" onClick={() => router.push("/driver/profile/documents")}>
                  <Icon name="shield" size={16} /> Manage documents
                </button>
                <button className="nr-doc-secondary" onClick={() => router.push("/driver/verification")}>
                  <Icon name="shield" size={16} /> Verification status
                </button>
              </div>
            </section>
          </>
        ) : (
          <section className="nr-profile-state-card" role="alert">
            <Icon name="info" size={22} />
            <strong>{say("Vehicle unavailable")}</strong>
            <p>{error || say("Vehicle information could not be loaded.")}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function VehicleDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="nr-vehicle-detail">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

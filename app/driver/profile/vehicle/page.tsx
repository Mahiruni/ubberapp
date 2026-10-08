"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
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
        if (active) setError("We couldn’t load your vehicle details.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

  const verification = profile ? verificationSummary(profile) : null;

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label="Back to driver profile">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">NEXRIDE · DRIVER</span>
            <h1>Vehicle</h1>
            <p>Your verified vehicle details.</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide" /><span className="panel" /></div>
        ) : profile ? (
          <>
            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>{profile.vehicle || "Vehicle details incomplete"}</h2>
                  <p>{verification?.title || "Verification status unavailable"}</p>
                </div>
                <span className={"nr-doc-status " + (profile.reviewStatus === "approved" ? "approved" : profile.reviewStatus === "pending" ? "review" : profile.reviewStatus === "rejected" || profile.reviewStatus === "suspended" ? "danger" : "")}>
                  {profile.reviewStatus === "approved" ? "Approved" : profile.reviewStatus === "pending" ? "Under Review" : profile.reviewStatus === "rejected" ? "Rejected" : profile.reviewStatus === "suspended" ? "Restricted" : "Incomplete"}
                </span>
              </div>

              <div className="nr-vehicle-detail-grid">
                <VehicleDetail label="Vehicle model" value={profile.vehicle || "Not provided"} />
                <VehicleDetail label="Vehicle color" value={profile.vehicleColor || "Not provided"} />
                <VehicleDetail label="License plate" value={profile.vehiclePlate || "Not provided"} />
                <VehicleDetail label="Driver license" value={profile.licenseNumber ? "On file" : "Missing"} />
                <VehicleDetail label="Registration document" value={profile.vehicleRegistrationPath ? "On file" : "Missing"} />
              </div>

              {profile.reviewStatus === "rejected" && (
                <div className="nr-profile-alert">
                  <Icon name="info" size={17} />
                  <span>{profile.rejectionReason || "Your vehicle verification needs an update."}</span>
                </div>
              )}

              <div className="nr-profile-locked-note">
                <Icon name="shield" size={17} />
                <span>Vehicle and plate changes require verification because they can affect driver eligibility.</span>
              </div>
            </section>

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Need to update the vehicle?</h2>
                  <p>Update registration documents and submit changes for review.</p>
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
            <strong>Vehicle unavailable</strong>
            <p>{error || "Vehicle information could not be loaded."}</p>
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

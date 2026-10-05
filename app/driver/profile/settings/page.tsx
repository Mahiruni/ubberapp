"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { supabase } from "../../../../lib/supabase";
import { loadDriverProfileData, type DriverProfileData } from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";

export default function DriverProfileSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [success, setSuccess] = useState(false);

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
        router.replace("/auth");
        return;
      }

      if (!active) return;
      setProfile(next);
      setName(next.fullName);
      setPhone(next.phone);
      setLoading(false);
    })().catch(() => {
      if (active) {
        setFeedback("NexRide could not load profile settings.");
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
    const cleanPhone = phone.trim();

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
      .update({ full_name: cleanName, phone: cleanPhone })
      .eq("id", profile.id);

    if (error) {
      setFeedback(error.message || "Profile changes could not be saved.");
      setBusy(false);
      return;
    }

    await supabase.auth.updateUser({
      data: {
        full_name: cleanName,
        phone: cleanPhone,
      },
    });

    setProfile({ ...profile, fullName: cleanName, phone: cleanPhone });
    setSuccess(true);
    setFeedback("Profile information updated.");
    setBusy(false);
  }

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver" data-theme="dark">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label="Back to driver profile">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">DRIVER PROFILE</span>
            <h1>Settings</h1>
            <p>Editable profile information</p>
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
                  <p>Name and phone are editable profile fields. They do not change your verified driver license or vehicle identity.</p>
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
                    onChange={(event) => setPhone(event.target.value)}
                    disabled={profile.accountStatus !== "active"}
                  />
                </label>
                <label>
                  Account email
                  <input value={profile.email || "Not available"} disabled aria-describedby="nr-email-note" />
                </label>
                <small id="nr-email-note">Email is shown for account reference and is not changed from this profile form.</small>

                <button type="submit" disabled={busy || profile.accountStatus !== "active"}>
                  {busy ? "Saving…" : "Save profile changes"}
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
                  <h2>Verified information</h2>
                  <p>Driver license, vehicle plate, and verification documents require the review flow.</p>
                </div>
              </div>
              <div className="nr-doc-actions">
                <button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/documents")}>
                  <Icon name="shield" size={16} /> Documents
                </button>
                <button className="nr-doc-secondary" onClick={() => router.push("/driver/profile/vehicle")}>
                  <Icon name="car" size={16} /> Vehicle
                </button>
              </div>
            </section>

            <div className="nr-profile-locked-note">
              <Icon name="shield" size={17} />
              <span>NexRide keeps personal, verification, and financial data inside authenticated account surfaces. These details are not added to trip-share previews or general notification text.</span>
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

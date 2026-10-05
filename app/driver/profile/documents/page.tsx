"use client";

import { ChangeEvent, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../../components/nexride/ui";
import { supabase } from "../../../../lib/supabase";
import {
  documentStatus,
  loadDriverProfileData,
  type DriverDocumentStatus,
  type DriverProfileData,
} from "../../../../lib/nexride-driver-profile";
import "../../../nexride.css";
import "../profile.css";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function extensionFor(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext) return ext;
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function statusTone(status: DriverDocumentStatus) {
  if (status === "Approved") return "approved";
  if (status === "Under Review" || status === "Submitted") return "review";
  if (status === "Missing" || status === "Expired" || status === "Rejected" || status === "Restricted") return "danger";
  return "";
}

export default function DriverDocumentsPage() {
  const router = useRouter();
  const licenseInput = useRef<HTMLInputElement>(null);
  const registrationInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<DriverProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"license" | "registration" | "view" | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [replacementExpiry, setReplacementExpiry] = useState("");

  async function refresh(userId: string) {
    const next = await loadDriverProfileData(userId);
    if (next.role !== "driver") {
      router.replace("/auth");
      return null;
    }
    setProfile(next);
    setReplacementExpiry(next.licenseExpiry || "");
    return next;
  }

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
        await refresh(data.session.user.id);
      } catch {
        if (active) {
          setMessageTone("error");
          setMessage("NexRide could not load your verification documents.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  async function openDocument(path: string) {
    if (!path || busy) return;
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy("view");
    setMessage("");
    const { data, error } = await supabase.storage
      .from("driver-verification")
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      popup?.close();
      setMessageTone("error");
      setMessage("This private document could not be opened. Try again while signed in.");
    } else if (popup) {
      popup.location.href = data.signedUrl;
    } else {
      setMessageTone("info");
      setMessage("Your browser blocked the document window. Allow pop-ups for NexRide and try again.");
    }
    setBusy(null);
  }

  async function replaceDocument(kind: "license" | "registration", file: File | null) {
    if (!profile || !file || busy) return;
    setMessage("");

    if (profile.accountStatus !== "active" || profile.reviewStatus === "suspended") {
      setMessageTone("error");
      setMessage("Document replacement is unavailable while this driver account is restricted.");
      return;
    }

    if (!allowedTypes.has(file.type)) {
      setMessageTone("error");
      setMessage("Use a JPG, PNG, WebP, or PDF document.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setMessageTone("error");
      setMessage("The replacement document must be 8 MB or smaller.");
      return;
    }

    if (
      !profile.licenseNumber ||
      !profile.vehicle ||
      !profile.vehiclePlate ||
      !profile.licenseDocumentPath ||
      !profile.vehicleRegistrationPath
    ) {
      setMessageTone("info");
      setMessage("Your verification set is incomplete. Use Complete verification to submit all required details together.");
      return;
    }

    let expiry = profile.licenseExpiry;
    if (kind === "license") {
      expiry = replacementExpiry;
      const expiryDate = expiry ? new Date(expiry + "T23:59:59") : null;
      if (!expiryDate || !Number.isFinite(expiryDate.getTime()) || expiryDate.getTime() <= Date.now()) {
        setMessageTone("error");
        setMessage("Enter the new future license expiry date before replacing the license document.");
        return;
      }
    }

    setBusy(kind);
    const oldPath = kind === "license" ? profile.licenseDocumentPath : profile.vehicleRegistrationPath;
    const nextPath = profile.id + "/" + (kind === "license" ? "driver-license-" : "vehicle-registration-") + Date.now() + "." + extensionFor(file);

    const upload = await supabase.storage
      .from("driver-verification")
      .upload(nextPath, file, { upsert: false, contentType: file.type });

    if (upload.error) {
      setBusy(null);
      setMessageTone("error");
      setMessage(upload.error.message || "Document upload failed.");
      return;
    }

    const updatePayload = kind === "license"
      ? { license_document_path: nextPath, license_expiry: expiry }
      : { vehicle_registration_path: nextPath };

    const { error: updateError } = await supabase
      .from("drivers")
      .update(updatePayload)
      .eq("id", profile.id);

    if (updateError) {
      await supabase.storage.from("driver-verification").remove([nextPath]);
      setBusy(null);
      setMessageTone("error");
      setMessage(updateError.message || "The replacement could not be submitted for review.");
      return;
    }

    if (oldPath && oldPath !== nextPath) {
      await supabase.storage.from("driver-verification").remove([oldPath]);
    }

    await refresh(profile.id);
    setBusy(null);
    setMessageTone("success");
    setMessage("Replacement uploaded securely. Your verification is now under review and driver availability is paused until approval.");
  }

  function handleFile(kind: "license" | "registration") {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] || null;
      void replaceDocument(kind, file);
      event.target.value = "";
    };
  }

  const licenseStatus = profile ? documentStatus(profile, "license") : "Missing";
  const registrationStatus = profile ? documentStatus(profile, "registration") : "Missing";
  const incomplete = profile
    ? !profile.licenseDocumentPath || !profile.vehicleRegistrationPath || !profile.licenseNumber || !profile.vehicle || !profile.vehiclePlate
    : true;

  return (
    <main className="nr-app nr-driver-profile-subpage" data-mode="driver" data-theme="dark">
      <div className="nr-driver-profile-subwrap">
        <header className="nr-profile-subhead">
          <button className="nr-driver-icon-btn" onClick={() => router.replace("/driver/home?screen=profile")} aria-label="Back to driver profile">
            <Icon name="back" />
          </button>
          <div>
            <span className="nr-driver-kicker">DRIVER PROFILE</span>
            <h1>Documents</h1>
            <p>Private verification documents · visible only to you and authorized NexRide reviewers</p>
          </div>
        </header>

        {loading ? (
          <div className="nr-driver-profile-loading" aria-busy="true"><span className="wide" /><span className="panel" /></div>
        ) : profile ? (
          <>
            {profile.reviewStatus === "rejected" && (
              <div className="nr-profile-alert">
                <Icon name="info" size={17} />
                <span>{profile.rejectionReason || "Your latest submission needs an update."}</span>
              </div>
            )}

            {message && (
              <div className={"nr-profile-alert " + (messageTone === "success" ? "success" : messageTone === "info" ? "info" : "")} role={messageTone === "error" ? "alert" : "status"}>
                <Icon name={messageTone === "success" ? "check" : "info"} size={17} />
                <span>{message}</span>
              </div>
            )}

            <section className="nr-profile-panel">
              <div className="nr-profile-panel-head">
                <div>
                  <h2>Verification documents</h2>
                  <p>Replacing an approved document sends the verification set back to review and takes the driver offline until approval.</p>
                </div>
              </div>

              <DocumentCard
                title="Driver license"
                status={licenseStatus}
                detail={profile.licenseNumber ? "License ending " + profile.licenseNumber.slice(-4) : "License number not provided"}
                secondary={profile.licenseExpiry ? "Expires " + profile.licenseExpiry : "Expiry not provided"}
                canView={Boolean(profile.licenseDocumentPath)}
                onView={() => void openDocument(profile.licenseDocumentPath)}
                actionLabel={incomplete ? "Complete verification" : licenseStatus === "Expired" ? "Replace renewed license" : "Replace document"}
                onAction={() => {
                  if (incomplete) router.push("/driver/verification");
                  else licenseInput.current?.click();
                }}
                disabled={busy !== null || profile.reviewStatus === "suspended" || profile.accountStatus !== "active"}
              >
                {(licenseStatus === "Expired" || profile.reviewStatus === "rejected") && !incomplete && (
                  <label className="nr-safety-field">
                    New license expiry
                    <input type="date" value={replacementExpiry} onChange={(event) => setReplacementExpiry(event.target.value)} />
                  </label>
                )}
              </DocumentCard>

              <DocumentCard
                title="Vehicle registration"
                status={registrationStatus}
                detail={profile.vehiclePlate ? "Plate " + profile.vehiclePlate : "Plate not provided"}
                secondary="Vehicle registration"
                canView={Boolean(profile.vehicleRegistrationPath)}
                onView={() => void openDocument(profile.vehicleRegistrationPath)}
                actionLabel={incomplete ? "Complete verification" : "Replace document"}
                onAction={() => {
                  if (incomplete) router.push("/driver/verification");
                  else registrationInput.current?.click();
                }}
                disabled={busy !== null || profile.reviewStatus === "suspended" || profile.accountStatus !== "active"}
              />

              <input ref={licenseInput} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFile("license")} />
              <input ref={registrationInput} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFile("registration")} />
            </section>

            <div className="nr-profile-locked-note">
              <Icon name="shield" size={17} />
              <span>License numbers, vehicle plates, and verification documents are review-controlled. Editable contact information is kept separately in Settings.</span>
            </div>
          </>
        ) : (
          <section className="nr-profile-state-card" role="alert">
            <Icon name="info" size={22} />
            <strong>Documents unavailable</strong>
            <p>{message || "Your verification documents could not be loaded."}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function DocumentCard({
  title,
  status,
  detail,
  secondary,
  canView,
  onView,
  actionLabel,
  onAction,
  disabled,
  children,
}: {
  title: string;
  status: DriverDocumentStatus;
  detail: string;
  secondary: string;
  canView: boolean;
  onView: () => void;
  actionLabel: string;
  onAction: () => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="nr-document-card">
      <div className="nr-document-card-head">
        <div><h3>{title}</h3><small>Private verification file</small></div>
        <span className={"nr-doc-status " + statusTone(status)}>{status}</span>
      </div>
      <div className="nr-document-meta">
        <div><span>Details</span><strong>{detail}</strong></div>
        <div><span>Record</span><strong>{secondary}</strong></div>
      </div>
      {children}
      <div className="nr-doc-actions">
        <button className="nr-doc-secondary" disabled={!canView || disabled} onClick={onView}><Icon name="search" size={15} /> View</button>
        <button className="nr-doc-primary" disabled={disabled} onClick={onAction}><Icon name="share" size={15} /> {actionLabel}</button>
      </div>
    </article>
  );
}

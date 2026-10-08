"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import type { DriverReviewStatus } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { nexrideApiFetch } from "../../../lib/nexride-api-auth";
import { VEHICLE_COLOR_OPTIONS } from "../../../lib/nexride-vehicle";
import { unsubmittedDriverEvidencePaths, sanitizeDriverVerificationDraft } from "../../../lib/nexride-driver-evidence";
import "../auth/driver-auth.css";
import "../onboarding/driver-onboarding.css";
import "../../detail-system.css";

const allowedTypes = new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
const lockedForDraft = (status: DriverReviewStatus, editingApproved: boolean) =>
  status === "pending" || status === "suspended" || (status === "approved" && !editingApproved);

const extensionFor = (file: File) => {
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ext) return ext;
  return file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
};

export default function DriverVerificationPage() {
  const router = useRouter();
  const [status, setStatus] = useState<DriverReviewStatus>("draft");
  const [reason, setReason] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [plate, setPlate] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [registrationFile, setRegistrationFile] = useState<File | null>(null);
  const [existingLicensePath, setExistingLicensePath] = useState("");
  const [existingRegistrationPath, setExistingRegistrationPath] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingApproved, setEditingApproved] = useState(false);
  const [error, setError] = useState("");
  const [driverId, setDriverId] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!active) return;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }
      const role = await resolveSessionRole(session);
      if (!active) return;
      if (role !== "driver") {
        router.replace(role === "admin" ? "/admin" : "/");
        return;
      }
      setDriverId(session.user.id);
      // Migrate legacy session drafts that contained raw license numbers.
      // Keep non-sensitive vehicle drafts, scrub the ID number immediately.
      const draftKey = "nexride.driver.verification.draft." + session.user.id;
      try {
        const legacy = sessionStorage.getItem(draftKey);
        if (legacy) sessionStorage.setItem(draftKey, sanitizeDriverVerificationDraft(legacy));
      } catch {
        try { sessionStorage.removeItem(draftKey); } catch {}
      }
      if (session.user.user_metadata?.driver_onboarding_complete !== true) {
        router.replace("/driver/onboarding");
        return;
      }

      const { data, error: loadError } = await supabase
        .from("drivers")
        .select("license_number,license_expiry,vehicle,vehicle_color,vehicle_plate,review_status,rejection_reason,license_document_path,vehicle_registration_path")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;
      if (loadError) setError("We couldn’t load your verification status.");
      if (data) {
        const next = data.review_status as DriverReviewStatus;
        setStatus(next || "draft");
        setReason(data.rejection_reason || "");
        setLicenseNumber(data.license_number || "");
        setExistingLicensePath(data.license_document_path || "");
        setExistingRegistrationPath(data.vehicle_registration_path || "");
        setLicenseExpiry(data.license_expiry || "");
        setVehicle(data.vehicle || session.user.user_metadata?.vehicle || "");
        setVehicleColor(data.vehicle_color || session.user.user_metadata?.vehicle_color || "");
        setPlate(data.vehicle_plate || session.user.user_metadata?.vehicle_plate || "");
        if (!["approved", "pending", "suspended"].includes(next || "draft")) {
          try {
            const raw = sessionStorage.getItem("nexride.driver.verification.draft." + session.user.id);
            if (raw) {
              const draft = JSON.parse(raw);
              if (typeof draft.licenseExpiry === "string") setLicenseExpiry(draft.licenseExpiry.slice(0, 20));
              if (typeof draft.vehicle === "string") setVehicle(draft.vehicle.slice(0, 120));
              if (typeof draft.vehicleColor === "string") setVehicleColor(draft.vehicleColor.slice(0, 32));
              if (typeof draft.plate === "string") setPlate(draft.plate.slice(0, 60));
            }
          } catch {}
        }
      } else {
        setVehicle(session.user.user_metadata?.vehicle || "");
        setVehicleColor(session.user.user_metadata?.vehicle_color || "");
        setPlate(session.user.user_metadata?.vehicle_plate || "");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!driverId || loading || lockedForDraft(status, editingApproved)) return;
    try {
      sessionStorage.setItem(
        "nexride.driver.verification.draft." + driverId,
        // Sensitive government document numbers must not persist in browser storage.
        JSON.stringify({ licenseExpiry, vehicle, vehicleColor, plate }),
      );
    } catch {}
  }, [driverId, loading, status, editingApproved, licenseExpiry, vehicle, vehicleColor, plate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if ((!licenseFile && !existingLicensePath) || (!registrationFile && !existingRegistrationPath)) {
      setError("Upload only the missing documents. Existing submitted files are retained.");
      return;
    }
    for (const file of [licenseFile, registrationFile].filter((entry):entry is File=>entry!==null)) {
      if (!allowedTypes.has(file.type)) {
        setError("Use JPG, PNG, WebP, or PDF documents.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError("Each document must be 8 MB or smaller.");
        return;
      }
    }

    setBusy(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      setBusy(false);
      router.replace("/driver/auth");
      return;
    }

    const licensePath = licenseFile
      ? `${session.user.id}/driver-license-${Date.now()}.${extensionFor(licenseFile)}`
      : existingLicensePath;
    const registrationPath = registrationFile
      ? `${session.user.id}/vehicle-registration-${Date.now()}.${extensionFor(registrationFile)}`
      : existingRegistrationPath;
    // Upload to unique private paths and remember only paths created during
    // this attempt. Never delete or overwrite prior verified evidence.
    const uploadedPaths: string[] = [];
    const discardIncomplete = async () => {
      const paths = unsubmittedDriverEvidencePaths(uploadedPaths, [
        existingLicensePath, existingRegistrationPath,
      ]);
      if (paths.length) {
        // Database Storage policies forbid deletion if a concurrent request
        // already committed the path, protecting evidence after a lost reply.
        await supabase.storage.from("driver-verification").remove(paths).catch(() => {});
      }
    };
    try {
      if (licenseFile) {
        const uploaded = await supabase.storage.from("driver-verification")
          .upload(licensePath, licenseFile, { upsert: false, contentType: licenseFile.type });
        if (uploaded.error) throw new Error("Driver license upload failed.");
        uploadedPaths.push(licensePath);
      }
      if (registrationFile) {
        const uploaded = await supabase.storage.from("driver-verification")
          .upload(registrationPath, registrationFile, { upsert: false, contentType: registrationFile.type });
        if (uploaded.error) throw new Error("Vehicle document upload failed.");
        uploadedPaths.push(registrationPath);
      }

      const response = await nexrideApiFetch("/api/driver/verification", {
        method: "POST",
        body: JSON.stringify({
          licenseNumber: licenseNumber.trim(),
          licenseExpiry,
          vehicle: vehicle.trim(),
          vehicleColor,
          vehiclePlate: plate.trim(),
          licenseDocumentPath: licensePath,
          vehicleRegistrationPath: registrationPath,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        await discardIncomplete();
        const message =
          payload?.status === "license_expired"
            ? "Your driver license must have a future expiry date."
            : payload?.status === "verification_locked"
              ? "Approved or suspended verification cannot be replaced from this screen."
              : payload?.status === "identity_ownership_review_required"
                ? "This identity needs an ownership or replacement review. Visit Manage Account for help."
                : payload?.status === "verification_document_missing"
                  ? "One of your document files is missing. Existing submitted files are kept."
                  : payload?.status === "verification_document_invalid"
                    ? "A document is empty, unsupported or larger than 8 MB. Upload a valid JPG, PNG, WebP or PDF."
                    : "We couldn't submit your verification. Try again.";
        setError(message);
        return;
      }
      setStatus((payload.reviewStatus as DriverReviewStatus) || "pending");
      setExistingLicensePath(licensePath);
      setExistingRegistrationPath(registrationPath);
      setLicenseFile(null);
      setRegistrationFile(null);
      try { sessionStorage.removeItem("nexride.driver.verification.draft." + session.user.id); } catch {}
    } catch {
      await discardIncomplete();
      setError("Verification could not be confirmed. Check your connection and retry. Your existing submitted documents are preserved.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="driver-onboarding-page" aria-busy="true" />;

  const locked = lockedForDraft(status, editingApproved);

  return (
    <main className="driver-onboarding-page">
      <section className="driver-onboarding-card driver-auth-card">
        <Link href="/driver/home" className="driver-auth-back">← Back</Link>
        <Brand driver />
        <span className="driver-auth-role">NEXRIDE · DRIVER · STEP 2 OF 2</span>
        <h1>{status === "approved" ? "You’re verified" : status === "pending" ? "Verification submitted" : "Verify your account"}</h1>
        <p>
          {status === "approved"
            ? "Your driver account is approved and can go online."
            : status === "pending"
              ? "Your documents are private and awaiting review. Your status will update automatically."
              : "Upload your current driver license and vehicle registration. Only you and authorized NexRide reviewers can access these documents."}
        </p>

        {status === "rejected" && <div className="driver-auth-error" role="alert">{reason || "Your previous submission needs an update. Please upload the corrected documents."}</div>}
        {status === "suspended" && <div className="driver-auth-error" role="alert">Your driver access is suspended. Contact NexRide support before submitting new documents.</div>}

        {!locked && (
          <form onSubmit={submit}>
            <div className="driver-form-grid">
              <label>Driver license number<input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required /></label>
              <label>License expiry<input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} required /></label>
            </div>
            <div className="driver-form-grid">
              <label>Vehicle model<input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. Toyota Corolla" required /></label>
              <label>Vehicle color<select value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} required><option value="">Choose color</option>{VEHICLE_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.en}</option>)}</select></label>
            </div>
            <label>Vehicle plate<input value={plate} onChange={(e) => setPlate(e.target.value)} required /></label>
            <label>Driver license document {existingLicensePath && <small>Already submitted — upload only to replace</small>}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} required={!existingLicensePath} /></label>
            <label>Vehicle registration document {existingRegistrationPath && <small>Already submitted — upload only to replace</small>}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setRegistrationFile(e.target.files?.[0] || null)} required={!existingRegistrationPath} /></label>
            <small className="driver-auth-draft-note">Text fields are kept on this device if you navigate back. For security, browsers require document files to be selected again.</small>
            {error && <div className="driver-auth-error" role="alert">{error}</div>}
            <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit for review"}</button>
          </form>
        )}

        {status === "approved" && !editingApproved && <button className="driver-auth-submit" type="button" onClick={() => setEditingApproved(true)}>Update verified driver details</button>}
        {locked && status !== "approved" && <button className="driver-auth-submit" type="button" onClick={() => router.replace("/driver/home")}>Back to driver home</button>}
        {status === "approved" && !editingApproved && <button className="driver-auth-secondary" type="button" onClick={() => router.replace("/driver/home?screen=profile")}>Back to profile</button>}
      </section>
    </main>
  );
}

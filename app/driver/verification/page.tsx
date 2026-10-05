"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import type { DriverReviewStatus } from "../../../lib/nexride-driver-verification";
import "../auth/driver-auth.css";
import "../onboarding/driver-onboarding.css";

const allowedTypes = new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
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
  const [plate, setPlate] = useState("");
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const [registrationFile, setRegistrationFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!active) return;
      if (!session || session.user.user_metadata?.role !== "driver") {
        router.replace("/driver/auth");
        return;
      }
      if (session.user.user_metadata?.driver_onboarding_complete !== true) {
        router.replace("/driver/onboarding");
        return;
      }

      const { data, error: loadError } = await supabase
        .from("drivers")
        .select("license_number,license_expiry,vehicle_plate,review_status,rejection_reason")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;
      if (loadError) setError("Unable to load verification status.");
      if (data) {
        const next = data.review_status as DriverReviewStatus;
        setStatus(next || "draft");
        setReason(data.rejection_reason || "");
        setLicenseNumber(data.license_number || "");
        setLicenseExpiry(data.license_expiry || "");
        setPlate(data.vehicle_plate || session.user.user_metadata?.vehicle_plate || "");
      } else {
        setPlate(session.user.user_metadata?.vehicle_plate || "");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (!licenseFile || !registrationFile) {
      setError("Upload both your driver license and vehicle registration.");
      return;
    }
    for (const file of [licenseFile, registrationFile]) {
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

    const licensePath = `${session.user.id}/driver-license.${extensionFor(licenseFile)}`;
    const registrationPath = `${session.user.id}/vehicle-registration.${extensionFor(registrationFile)}`;

    const [licenseUpload, registrationUpload] = await Promise.all([
      supabase.storage.from("driver-verification").upload(licensePath, licenseFile, { upsert: true, contentType: licenseFile.type }),
      supabase.storage.from("driver-verification").upload(registrationPath, registrationFile, { upsert: true, contentType: registrationFile.type }),
    ]);

    if (licenseUpload.error || registrationUpload.error) {
      setError(licenseUpload.error?.message || registrationUpload.error?.message || "Document upload failed.");
      setBusy(false);
      return;
    }

    const { data, error: saveError } = await supabase
      .from("drivers")
      .update({
        license_number: licenseNumber.trim(),
        license_expiry: licenseExpiry,
        vehicle_plate: plate.trim(),
        license_document_path: licensePath,
        vehicle_registration_path: registrationPath,
      })
      .eq("id", session.user.id)
      .select("review_status")
      .single();

    if (saveError) {
      setError(saveError.message || "Unable to submit verification.");
      setBusy(false);
      return;
    }

    setStatus((data.review_status as DriverReviewStatus) || "pending");
    setBusy(false);
  }

  if (loading) return <main className="driver-onboarding-page" aria-busy="true" />;

  const locked = status === "pending" || status === "approved" || status === "suspended";

  return (
    <main className="driver-onboarding-page">
      <section className="driver-onboarding-card driver-auth-card">
        <Link href="/driver/home" className="driver-auth-back">← Driver home</Link>
        <Brand driver />
        <span className="driver-auth-role">DRIVER ONBOARDING · STEP 2 OF 2</span>
        <h1>{status === "approved" ? "You’re verified." : status === "pending" ? "Verification submitted." : "Verify your account."}</h1>
        <p>
          {status === "approved"
            ? "Your driver account is approved and can go online."
            : status === "pending"
              ? "Your documents are stored privately and are awaiting NexRide review. Status updates appear automatically in the driver dashboard."
              : "Upload your current driver license and vehicle registration. Documents stay in private storage and are available only to you and authorized NexRide reviewers."}
        </p>

        {status === "rejected" && <div className="driver-auth-error" role="alert">{reason || "Your previous submission needs an update. Please upload the corrected documents."}</div>}
        {status === "suspended" && <div className="driver-auth-error" role="alert">Your driver access is suspended. Contact NexRide support before submitting new documents.</div>}

        {!locked && (
          <form onSubmit={submit}>
            <div className="driver-form-grid">
              <label>Driver license number<input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} required /></label>
              <label>License expiry<input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} required /></label>
            </div>
            <label>Vehicle plate<input value={plate} onChange={(e) => setPlate(e.target.value)} required /></label>
            <label>Driver license document<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setLicenseFile(e.target.files?.[0] || null)} required /></label>
            <label>Vehicle registration document<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setRegistrationFile(e.target.files?.[0] || null)} required /></label>
            {error && <div className="driver-auth-error" role="alert">{error}</div>}
            <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? "Submitting securely…" : "Submit for Verification"}</button>
          </form>
        )}

        {locked && <button className="driver-auth-submit" type="button" onClick={() => router.replace("/driver/home")}>Continue to Driver Home</button>}
      </section>
    </main>
  );
}

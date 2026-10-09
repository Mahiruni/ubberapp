"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand, Icon, LanguageContext, useTranslation } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { nexrideAuthRedirectUrl } from "../../../lib/nexride-auth-url";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { announceLanguage } from "../../../components/nexride/language-provider";
import { VEHICLE_COLOR_OPTIONS } from "../../../lib/nexride-vehicle";
import { normalizeEthiopianPhone } from "../../../lib/nexride-identity";
import "../auth/driver-auth.css";
import "./driver-onboarding.css";
import "../../auth-experience.css";
import "../../detail-system.css";

export default function DriverOnboarding() {
  const router = useRouter();
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => (language === "am" ? am : en);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [vehicle, setVehicle] = useState("");
  const [vehicleColor, setVehicleColor] = useState("");
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [existingAccount, setExistingAccount] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      const role = await resolveSessionRole(data.session).catch(() => "");
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role === "rider" || role === "driver") {
        setExistingAccount(true);
        setName(String(data.session.user.user_metadata?.full_name || ""));
        setEmail(data.session.user.email || "");
        // Resume non-secret vehicle fields from the existing account rather
        // than restarting onboarding or requesting another password.
        const metadata = data.session.user.user_metadata || {};
        setVehicle(String(metadata.vehicle || ""));
        setVehicleColor(String(metadata.vehicle_color || ""));
        setPlate(String(metadata.vehicle_plate || ""));
        const owner = await supabase.from("profiles").select("full_name,phone")
          .eq("id",data.session.user.id).maybeSingle();
        if (!active) return;
        if(owner.data?.full_name)setName(owner.data.full_name);
        if(owner.data?.phone)setPhone(owner.data.phone);
      }
      if (role !== "driver") return;
      // Resume from the authoritative Driver state rather than a mutable
      // completion flag. A previously approved Driver need not reapply.
      const destination = await driverResumeDestination(data.session);
      if (active && destination !== "/driver/onboarding" && destination !== "/driver/auth")
        router.replace(destination);
    });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");

    const { data: sessionData } = await supabase.auth.getSession();
    const existing = sessionData.session;
    const existingRole = existing ? await resolveSessionRole(existing).catch(() => "") : "";

    if (existing && (existingRole === "rider" || existingRole === "driver")) {
      const { data: begin, error: beginError } = await supabase.rpc("account_begin_driver_application");
      if (beginError || begin !== "ready") {
        setError(say("Could not start Driver access under your existing account. Please retry.",
          "በነባሩ መለያዎ መቀጠል አልተቻለም።"));
        setBusy(false); return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          // Preserve previously shared name, phone and identity details.
          // Auth metadata is a UI hint, not the Driver approval authority.
          role: "driver",
          vehicle: vehicle.trim(),
          vehicle_color: vehicleColor,
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      });

      if (updateError) {
        setError(updateError.message || "Unable to save driver profile.");
        setBusy(false);
        return;
      }

      const current=await supabase.from("profiles").select("full_name,phone")
        .eq("id",existing.user.id).maybeSingle();
      if(!current.error && current.data){
        const patch:Record<string,string>={};
        if(!current.data.full_name&&name.trim())patch.full_name=name.trim();
        if(!current.data.phone&&phone.trim())patch.phone=normalizeEthiopianPhone(phone)||phone.trim();
        if(Object.keys(patch).length)await supabase.from("profiles").update(patch).eq("id",existing.user.id);
      }
      window.localStorage.setItem("nexride:active-account-role","driver");
      router.replace("/driver/verification");
      return;
    }

    const normalizedPhone = normalizeEthiopianPhone(phone);
    if (!normalizedPhone) {setError(say("Enter a valid Ethiopian mobile number.","ትክክለኛ የኢትዮጵያ ስልክ ያስገቡ።"));setBusy(false);return;}
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      setBusy(false); return;
    }
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: nexrideAuthRedirectUrl("/driver/auth?confirmed=1"),
        data: {
          role: "driver",
          full_name: name.trim(),
          phone: normalizeEthiopianPhone(phone) || phone.trim(),
          vehicle: vehicle.trim(),
          vehicle_color: vehicleColor,
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      },
    });

    if (signUpError) {
      // Do not enumerate registered email addresses. A returning NexRide
      // member can always use the ordinary sign-in and recovery flow.
      setError("We couldn't complete registration. Try again, or continue with your existing NexRide account.");
      setBusy(false);
      return;
    }

    if (data.session) {
      router.replace("/driver/verification");
      return;
    }

    setNotice("Your driver account was created. Confirm your email, then sign in to continue verification.");
    setBusy(false);
  }

  return (
    <main className="nr-auth-experience driver-onboarding-page" data-auth-mode="signup" data-mode="driver">
      <div className="nr-auth-page">
        <section className="nr-auth-shell nr-auth-shell-driver">
          <div className="nr-auth-hero nr-auth-hero-brand nr-auth-hero-driver" aria-hidden="true">
            <div className="nr-auth-hero-wash driver" />
            <div className="nr-auth-hero-top">
              <Brand />
              <span className="nr-auth-role-tab">Driver</span>
            </div>
            <div className="nr-auth-hero-copy">
              <span>NEXRIDE · DRIVER</span>
              <strong>Drive. Earn.<br />Grow.</strong>
              <div className="nr-auth-hero-steps">
                <span><b>1</b> Account</span>
                <span><b>2</b> Vehicle</span>
                <span><b>3</b> Verification</span>
              </div>
            </div>
          </div>

          <div className="nr-auth-content">
            <div className="nr-auth-content-tools">
              <Link href="/driver" className="nr-auth-back">← {t("back")}</Link>
              <button type="button" className="nr-auth-language-toggle" onClick={() => announceLanguage(language === "en" ? "am" : "en")}>
                {language === "en" ? "አማርኛ" : "English"}
              </button>
            </div>
            <span className="driver-auth-role">{t("driverAccount").toUpperCase()}</span>
            <h1>{existingAccount ? say("Apply to Drive","አሽከርካሪ ለመሆን ያመልክቱ") : t("driverCreateAccount")}</h1>
            <p>{existingAccount ? say("We reuse your existing account and verified identity. Only Driver and vehicle details are needed.","ነባሩ መለያዎ ይጠቀማል። የአሽከርካሪ መረጃ ብቻ ያስፈልጋል።") : say("Already have NexRide Rider? Sign in first to reuse your account. New Drivers can register below.", "ቀድሞ የNexRide መለያ አለዎት? መጀመሪያ ይግቡ።")}</p>
            <div className="nr-auth-hero-steps" aria-label="Driver application progress">
              <span>Account</span><span>Personal details</span><span>Vehicle</span><span>Documents</span><span>Verification</span>
            </div>

            <form onSubmit={submit} className="nr-auth-form nr-auth-signup-form">
              <div className="driver-form-grid">
                <label><span>{t("fullName")}</span><div className="nr-auth-input"><Icon name="user" size={19}/><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t("fullName")} required /></div></label>
                <label><span>{t("phoneNumber")}</span><div className="nr-auth-input"><Icon name="phone" size={19}/><input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+251…" required={!existingAccount} readOnly={existingAccount && Boolean(phone)} /></div></label>
              </div>
              <label><span>{t("authEmail")}</span><div className="nr-auth-input"><Icon name="user" size={19}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder={t("authEmail")} required={!existingAccount} readOnly={existingAccount} /></div></label>
              <label><span>{t("password")}</span><div className="nr-auth-input nr-auth-password-row"><Icon name="shield" size={19}/><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} placeholder={existingAccount ? "Existing account — no new password" : t("password")} aria-describedby="driver-password-help" required={!existingAccount} disabled={existingAccount} /><button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></label>
              <p id="driver-password-help" className="nr-auth-helper">{say("Use at least 8 characters.", "ቢያንስ 6 ቁምፊዎችን ይጠቀሙ።")}</p>

              <div className="nr-auth-subsection">
                <div><span>{say("VEHICLE DETAILS", "የተሽከርካሪ መረጃ")}</span><small>{say("Used to prepare your driver verification.", "የአሽከርካሪ ማረጋገጫዎን ለማዘጋጀት ይጠቅማል።")}</small></div>
                <div className="driver-form-grid">
                  <label><span>{say("Vehicle model", "የተሽከርካሪ ሞዴል")}</span><div className="nr-auth-input"><Icon name="settings" size={19}/><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Toyota Corolla" required /></div></label>
                  <label>
                    <span>{say("Vehicle color", "የተሽከርካሪ ቀለም")}</span>
                    <div className="nr-auth-input nr-auth-select-row">
                      <Icon name="settings" size={19}/>
                      <select value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} required aria-label={say("Vehicle color", "የተሽከርካሪ ቀለም")}>
                        <option value="">{say("Choose color", "ቀለም ይምረጡ")}</option>
                        {VEHICLE_COLOR_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {language === "am" ? option.am : option.en}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                </div>
                <label><span>{say("Plate number", "የሰሌዳ ቁጥር")}</span><div className="nr-auth-input"><Icon name="card" size={19}/><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="2-A12345" required /></div></label>
              </div>

              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}<Link href="/driver/auth">Sign in as Driver</Link></div>}
              <div className="nr-auth-cta-dock"><button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? t("creatingAccount") : existingAccount ? say("Continue verification","ማረጋገጫውን ቀጥል") : t("createAccount")}</button></div>
            </form>

            <div className="nr-auth-divider"><span>or</span></div>
            <Link className="nr-auth-create-link" href="/driver/auth">{t("alreadyHaveAccount")} <strong>Continue with NexRide →</strong></Link>
            <div className="nr-auth-role-note">
              <span><Icon name="briefcase" size={20}/></span>
              <div><strong>Driver account</strong><small>Complete verification, manage trips, and track earnings.</small></div>
            </div>
            <Link className="nr-auth-role-link" href="/rider/sign-in">Looking for a ride? <strong>Switch to Rider →</strong></Link>
          </div>
        </section>
      </div>
    </main>
  );
}

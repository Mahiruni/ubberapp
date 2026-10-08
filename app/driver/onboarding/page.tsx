"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand, Icon, LanguageContext, useTranslation } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { nexrideAuthRedirectUrl } from "../../../lib/nexride-auth-url";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { announceLanguage } from "../../../components/nexride/language-provider";
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
  const [plate, setPlate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      if (role !== "driver") return;
      if (data.session.user.user_metadata?.driver_onboarding_complete === true) {
        router.replace("/driver/verification");
      }
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

    if (existing && existingRole === "driver") {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          role: "driver",
          full_name: name.trim(),
          phone: phone.trim(),
          vehicle: vehicle.trim(),
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      });

      if (updateError) {
        setError(updateError.message || "Unable to save driver profile.");
        setBusy(false);
        return;
      }

      await supabase.from("profiles").update({ full_name: name.trim(), phone: phone.trim() }).eq("id", existing.user.id);
      router.replace("/driver/verification");
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: nexrideAuthRedirectUrl("/driver/auth?confirmed=1"),
        data: {
          role: "driver",
          full_name: name.trim(),
          phone: phone.trim(),
          vehicle: vehicle.trim(),
          vehicle_plate: plate.trim(),
          driver_onboarding_complete: true,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
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
            <h1>{t("driverCreateAccount")}</h1>
            <p>{say("Create your account now. Vehicle and document verification continues after signup.", "መለያዎን አሁን ይፍጠሩ። የተሽከርካሪ እና የሰነድ ማረጋገጫ ከምዝገባ በኋላ ይቀጥላል።")}</p>

            <form onSubmit={submit} className="nr-auth-form nr-auth-signup-form">
              <div className="driver-form-grid">
                <label><span>{t("fullName")}</span><div className="nr-auth-input"><Icon name="user" size={19}/><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t("fullName")} required /></div></label>
                <label><span>{t("phoneNumber")}</span><div className="nr-auth-input"><Icon name="phone" size={19}/><input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" inputMode="tel" placeholder="+251…" required /></div></label>
              </div>
              <label><span>{t("authEmail")}</span><div className="nr-auth-input"><Icon name="user" size={19}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder={t("authEmail")} required /></div></label>
              <label><span>{t("password")}</span><div className="nr-auth-input nr-auth-password-row"><Icon name="shield" size={19}/><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} placeholder={t("password")} aria-describedby="driver-password-help" required /><button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></label>
              <p id="driver-password-help" className="nr-auth-helper">{say("Use at least 6 characters.", "ቢያንስ 6 ቁምፊዎችን ይጠቀሙ።")}</p>

              <div className="nr-auth-subsection">
                <div><span>{say("VEHICLE DETAILS", "የተሽከርካሪ መረጃ")}</span><small>{say("Used to prepare your driver verification.", "የአሽከርካሪ ማረጋገጫዎን ለማዘጋጀት ይጠቅማል።")}</small></div>
                <div className="driver-form-grid">
                  <label><span>{say("Vehicle", "ተሽከርካሪ")}</span><div className="nr-auth-input"><Icon name="settings" size={19}/><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="Toyota Corolla" required /></div></label>
                  <label><span>{say("Plate number", "የሰሌዳ ቁጥር")}</span><div className="nr-auth-input"><Icon name="card" size={19}/><input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="2-A12345" required /></div></label>
                </div>
              </div>

              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}<Link href="/driver/auth">Sign in as Driver</Link></div>}
              <div className="nr-auth-cta-dock"><button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? t("creatingAccount") : t("createAccount")}</button></div>
            </form>

            <div className="nr-auth-divider"><span>or</span></div>
            <Link className="nr-auth-create-link" href="/driver/auth">{t("alreadyHaveAccount")} <strong>{t("signIn")}</strong></Link>
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

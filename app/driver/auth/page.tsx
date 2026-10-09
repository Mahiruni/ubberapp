"use client";

import { FormEvent, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand, Icon, LanguageContext, useTranslation } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { clearExplicitSignOut, enterDriver, explicitSignOutRole } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { authErrorKey } from "../../../lib/nexride-auth-errors";
import { announceLanguage } from "../../../components/nexride/language-provider";
import "../driver-welcome.css";
import "./driver-auth.css";
import "../../auth-experience.css";
import "../../detail-system.css";

export default function DriverAuth() {
  const router = useRouter();
  const t = useTranslation();
  const language = useContext(LanguageContext);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const confirmationLanding = params.get("confirmed") === "1";
    if (confirmationLanding) setNotice(t("emailConfirmed"));
    // Confirmation links must not automatically restore a logged-out user.
    if (explicitSignOutRole(window.localStorage)) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session || explicitSignOutRole(window.localStorage)) return;
      const role = await resolveSessionRole(data.session);
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role === "rider") {
        // Same verified Supabase identity, new Driver onboarding. No signup.
        router.replace("/driver/onboarding");
        return;
      }
      if (role !== "driver") return;
      enterDriver(data.session);
      const destination = await driverResumeDestination(data.session);
      if (active && !explicitSignOutRole(window.localStorage)) router.replace(destination);
    });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.session) {
      setError(t(authErrorKey(authError, "signin")));
      setBusy(false);
      return;
    }

    clearExplicitSignOut();
    window.localStorage.setItem("nexride:active-account-role","driver");
    const role = await resolveSessionRole(data.session);
    if (role === "admin") {
      router.replace("/admin");
      return;
    }
    if (role === "rider") {
      // Auth was successful; do not create a second Auth identity.
      // Membership is provisioned only once onboarding is submitted.
      router.replace("/driver/onboarding");
      return;
    }
    if (role !== "driver") {
      setError("Driver access could not be verified. Please try again.");
      setBusy(false);
      return;
    }

    enterDriver(data.session);
    const destination = await driverResumeDestination(data.session);
    router.replace(destination);
  }

  return (
    <main className="nr-auth-experience driver-auth-page" data-auth-mode="signin" data-mode="driver">
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
              <div className="nr-auth-hero-points">
                <span>One account</span>
                <span>Verified access</span>
                <span>Driver-ready</span>
              </div>
            </div>
          </div>

          <div className="nr-auth-content">
            <div className="nr-auth-content-tools">
              <Link href="/driver" className="nr-auth-back">← Back</Link>
              <button type="button" className="nr-auth-language-toggle" onClick={() => announceLanguage(language === "en" ? "am" : "en")}>
                {language === "en" ? "አማርኛ" : "English"}
              </button>
            </div>
            <span className="driver-auth-role">{t("driverAccount").toUpperCase()}</span>
            <h1>{t("driverSignInTitle")}</h1>
            <p>Your NexRide account works here too. Continue with your existing account to become a Driver.</p>

            <form onSubmit={submit} className="nr-auth-form">
              <label><span>Email address</span><div className="nr-auth-input"><Icon name="user" size={19}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="Email address" required /></div></label>
              <label><span>{t("password")}</span><div className="nr-auth-input nr-auth-password-row"><Icon name="shield" size={19}/><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder={t("password")} required /><button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button></div></label>
              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}</div>}
              <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? t("signingIn") : "Continue with NexRide"}</button>
            </form>

            <p className="nr-auth-helper"><Link href="/rider/forgot-password">Forgot password?</Link> · One secure NexRide login for Rider and Driver.</p>
            <div className="nr-auth-divider"><span>or</span></div>
            <Link className="nr-auth-create-link" href="/driver/onboarding"><Icon name="plus" size={18}/>{t("driverCreateAccount")}</Link>
            <div className="nr-auth-role-note">
              <span><Icon name="briefcase" size={20}/></span>
              <div><strong>{t("driverAuthOnly")}</strong><small>Go online, manage trips, and keep your account ready.</small></div>
            </div>
            <Link className="nr-auth-role-link" href="/rider/sign-in">Looking for a ride? <strong>Switch to Rider →</strong></Link>
          </div>
        </section>
      </div>
    </main>
  );
}

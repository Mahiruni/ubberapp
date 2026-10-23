"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../../components/nexride/entry";
import { Icon, useTranslation } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { clearExplicitSignOut, enterDriver, explicitSignOutRole } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { authErrorKey } from "../../../lib/nexride-auth-errors";
import { withOperationTimeout } from "../../../lib/nexride-operation";
import "../driver-welcome.css";
import "./driver-auth.css";
import "../../auth-experience.css";
import "../../detail-system.css";

export default function DriverAuth() {
  const router = useRouter();
  const t = useTranslation();
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
    if (confirmationLanding) setNotice(t("entryConfirmNotice"));
    const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description") || params.get("error_description");
    if (linkError) setError(t(authErrorKey(linkError)));
    // Confirmation links must not automatically restore a logged-out user.
    if (explicitSignOutRole(window.localStorage)) return;
    withOperationTimeout(supabase.auth.getSession()).then(async ({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (!active || !data.session || explicitSignOutRole(window.localStorage)) return;
      const role = await resolveSessionRole(data.session);
      if (!active) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role !== "driver") {
        router.replace("/driver/onboarding");
        return;
      }
      const destination = await driverResumeDestination(data.session!, role);
      if (destination === "/driver/home") enterDriver(data.session!);
      if (active && !explicitSignOutRole(window.localStorage)) router.replace(destination);
    }).catch(() => { if (active) setError(t("authNetworkFailure")); });
    return () => { active = false; };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    let data;
    try {
      const result = await withOperationTimeout(supabase.auth.signInWithPassword({ email: email.trim(), password }));
      if (result.error || !result.data.session) {
        setError(t(authErrorKey(result.error, "signin"))); setBusy(false); return;
      }
      data = result.data;
    } catch {
      setError(t("authNetworkFailure")); setBusy(false); return;
    }

    try {
      const role = await resolveSessionRole(data.session!);
      const destination = role === "admin" ? "/admin" : role === "driver"
        ? await driverResumeDestination(data.session!, role) : "/driver/onboarding";
      clearExplicitSignOut();
      window.localStorage.setItem("nexride:active-account-role", "driver");
      if (destination === "/driver/home") enterDriver(data.session!);
      router.replace(destination);
    } catch {
      setError(t("authNetworkFailure"));
      setBusy(false);
    }
  }

  return (
    <EntryShell role="driver" authMode="signin">
            <span className="driver-auth-role">{t("driverAccount").toUpperCase()}</span>
            <h1>{t("entrySignInHeadline")}</h1>
            <p>{t("entryDriverSignInIntro")}</p>

            <form onSubmit={submit} className="nr-auth-form" aria-busy={busy}>
              <label><span>{t("authEmail")}</span><div className="nr-auth-input"><Icon name="mail" size={20}/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" inputMode="email" placeholder={t("authEmail")} required /></div></label>
              <label><span>{t("password")}</span><div className="nr-auth-input nr-auth-password-row"><Icon name="lock" size={20}/><input type={showPassword ? "text" : "password"} aria-label={t("password")} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder={t("password")} required /><button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{t(showPassword ? "entryHide" : "entryShow")}</button></div></label>
              {error && <div className="driver-auth-error" role="alert">{error}</div>}
              {notice && <div className="driver-auth-notice" role="status">{notice}</div>}
              <Link className="nr-auth-inline-link" href="/rider/verify-email?role=driver&purpose=recovery">{t("forgotPassword")}</Link>
              <button className="driver-auth-submit" type="submit" disabled={busy}>{busy ? t("signingIn") : t("signIn")}</button>
            </form>

            <div className="nr-auth-divider"><span>{t("entryOr")}</span></div>
            <Link className="nr-auth-inline-link" href="/rider/verify-email?role=driver">{t("entryVerify")}</Link>
            <Link className="nr-auth-create-link" href="/driver/onboarding"><Icon name="plus" size={18}/>{t("driverCreateAccount")}</Link>
            <div className="nr-auth-role-note">
              <span><Icon name="briefcase" size={20}/></span>
              <div><strong>{t("driverAuthOnly")}</strong><small>{t("entryDriverVerificationNote")}</small></div>
            </div>
            <Link className="nr-auth-role-link" href="/rider/sign-in">{t("entrySwitchRider")} <Icon name="arrow" size={16}/></Link>
    </EntryShell>
  );
}

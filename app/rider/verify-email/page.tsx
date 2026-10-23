"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../../components/nexride/entry";
import { Button, InputField, PasswordField, useTranslation } from "../../../components/nexride/ui";
import { supabase } from "../../../lib/supabase";
import { nexrideAuthRedirectUrl } from "../../../lib/nexride-auth-url";
import { clearExplicitSignOut, enterRider, ONBOARDING_KEY } from "../../../lib/nexride-startup";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { ensureRiderProfile, RiderProfileBootstrapError } from "../../../lib/nexride-rider-profile-bootstrap";
import { withOperationTimeout } from "../../../lib/nexride-operation";
import "../../../app/nexride.css";

type Purpose = "signup" | "recovery";
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export default function EmailVerification() {
  const router = useRouter();
  const t = useTranslation();
  const [purpose, setPurpose] = useState<Purpose>("signup");
  const [returnRole, setReturnRole] = useState<"rider" | "driver">("rider");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("nexride:verification-target");
      const target = JSON.parse(raw || "{}") as { email?: string; role?: string; purpose?: string };
      if (target.email && validEmail(target.email)) setEmail(target.email);
      if (target.role === "driver") setReturnRole("driver");
      if (target.purpose === "recovery") setPurpose("recovery");
    } catch { /* The verification screen remains usable without saved form context. */ }
    const params = new URLSearchParams(window.location.search);
    if (params.get("role") === "driver") setReturnRole("driver");
    if (params.get("purpose") === "recovery") setPurpose("recovery");
  }, []);
  useEffect(() => {
    if (!lastSent) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lastSent]);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !validEmail(email) || !/^\d{6}$/.test(code)) { setError(t("entryCodeMissing")); return; }
    setBusy(true); setError("");
    try {
      const result = await withOperationTimeout(supabase.auth.verifyOtp({email: email.trim().toLowerCase(), token: code, type: purpose === "signup" ? "signup" : "recovery"}));
      if (result.error) { setError(t("entryCodeInvalid")); return; }
      try { window.sessionStorage.removeItem("nexride:verification-target"); } catch { /* Storage is optional. */ }
      if (purpose === "recovery") { setVerified(true); setMessage(t("entryRecoveryConfirmed")); }
      else {
        const session = result.data.session;
        if (!session) { setError(t("entryVerificationFailure")); return; }
        // The person explicitly verified this code. Reuse that authenticated
        // identity and continue the unfinished journey without another login.
        clearExplicitSignOut();
        const role = await resolveSessionRole(session);
        if (role === "admin") { router.replace("/admin"); return; }
        if (returnRole === "driver" || role === "driver") {
          router.replace(await driverResumeDestination(session, role));
          return;
        }
        await ensureRiderProfile(session);
        try { localStorage.setItem(ONBOARDING_KEY, "true"); } catch {}
        enterRider(session);
        router.replace("/");
      }
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError && cause.code === "rider_profile_incomplete") router.replace("/rider/complete-profile");
      else setError(t("entryVerificationFailure"));
    }
    finally { setBusy(false); }
  }
  async function resend() {
    if (busy || !validEmail(email) || Date.now() - lastSent < 60000) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = purpose === "signup"
        ? await withOperationTimeout(supabase.auth.resend({type:"signup",email:email.trim().toLowerCase(),options:{emailRedirectTo:nexrideAuthRedirectUrl(returnRole === "driver" ? "/driver/auth?confirmed=1" : "/rider/sign-in?confirmed=1")}}))
        : await withOperationTimeout(supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:nexrideAuthRedirectUrl("/rider/reset-password")}));
      if (result.error) { setError(t("entryEmailFailure")); return; }
      try { window.sessionStorage.setItem("nexride:verification-target", JSON.stringify({ email: email.trim().toLowerCase(), role: returnRole, purpose })); } catch { /* Confirmation links remain usable without saved context. */ }
      setLastSent(Date.now());
      setMessage(t("entryEmailSent"));
    } catch { setError(t("entryEmailFailure")); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verified || busy) return;
    if (password.length < 12 || password !== confirm) { setError(t("entryPassword12Mismatch")); return; }
    setBusy(true); setError("");
    try {
      const result = await withOperationTimeout(supabase.auth.updateUser({password}));
      if (result.error) { setError(t("passwordUpdateFailure")); return; }
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) { setMessage(t("entryPasswordSignOut")); return; }
      router.replace(returnRole === "driver" ? "/driver/auth?passwordUpdated=1" : "/rider/sign-in?passwordUpdated=1");
    } catch { setError(t("passwordUpdateFailure")); }
    finally { setBusy(false); }
  }
  return <EntryShell role={returnRole} authMode="verify">
    <span className="nr-rider-entry-kicker">BILOO · {t(returnRole === "driver" ? "driver" : "rider")}</span>
    <h1>{t(verified ? "chooseNewPassword" : purpose === "recovery" ? "resetPassword" : "entryVerificationTitle")}</h1>
    <p>{t(verified ? "resetPasswordIntro" : purpose === "recovery" ? "entryRecoveryIntro" : "entryVerificationIntro")}</p>
    {!verified ? <>
      <form className="nr-profile-form" onSubmit={e => {e.preventDefault(); void resend();}} aria-busy={busy}>
        <InputField label={t("authEmail")} type="email" autoComplete="email" inputMode="email" required value={email} onChange={e => setEmail(e.target.value)}/>
        <Button type="submit" disabled={busy || !validEmail(email) || (lastSent > 0 && clock - lastSent < 60000)} loading={busy}>{t("entryResend")}</Button>
        {lastSent > 0 && clock - lastSent < 60000 && <p className="nr-auth-helper" role="status">{t("entryResendWaiting")}</p>}
      </form>
      <details className="nr-auth-preview"><summary>{t("entryCodeOption")}</summary><form className="nr-profile-form" onSubmit={verify} aria-busy={busy}><InputField label={t("entryCode")} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0,6))}/><Button type="submit" disabled={busy} loading={busy}>{t("entryVerify")}</Button></form></details>
    </> : <form className="nr-profile-form" onSubmit={changePassword} aria-busy={busy}>
      <PasswordField label={t("password")} minLength={12} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}/>
      <p className="nr-auth-helper">{t("entryPassword12")}</p>
      <PasswordField label={t("confirmPassword")} minLength={12} required autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/><Button type="submit" disabled={busy} loading={busy}>{t("updatePassword")}</Button>
    </form>}
    {error && <p className="nr-auth-error" role="alert">{error}</p>}
    {message && <p className="nr-auth-notice" role="status">{message}</p>}
    <p className="nr-auth-helper">{t("entryCodePrivacy")}</p>
    <Link className="nr-auth-inline-link" href={returnRole === "driver" ? "/driver/auth" : "/rider/sign-in"}>{t("signIn")}</Link>
  </EntryShell>;
}

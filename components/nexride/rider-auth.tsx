"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryShell } from "./entry";
import { Button, Icon, InputField, PasswordField, StatusBanner, useTranslation } from "./ui";
import { supabase } from "../../lib/supabase";
import {
  clearExplicitSignOut,
  enterRider,
  explicitSignOutRole,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
  retryStartup,
} from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { ensureRiderProfile, RiderProfileBootstrapError } from "../../lib/nexride-rider-profile-bootstrap";
import { nexrideAuthRedirectUrl } from "../../lib/nexride-auth-url";
import { authErrorKey } from "../../lib/nexride-auth-errors";
import { normalizeEthiopianPhone } from "../../lib/nexride-identity";

export type RiderAuthMode = "signin" | "signup" | "forgot" | "reset";

export function RiderAuthScreen({ mode }: { mode: RiderAuthMode }) {
  const [entryRole, setEntryRole] = useState<"rider" | "driver">("rider");
  useEffect(() => {
    if (mode !== "forgot" && mode !== "reset") return;
    let active = true;
    try {
      const target = JSON.parse(sessionStorage.getItem("nexride:verification-target") || "{}");
      if (target.role === "driver" || new URLSearchParams(location.search).get("role") === "driver") {
        setEntryRole("driver");
        return;
      }
    } catch { /* Recovery remains available without device storage. */ }
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user.user_metadata?.role === "driver") setEntryRole("driver");
    }).catch(() => {});
    return () => { active = false; };
  }, [mode]);
  return (
    <EntryShell authMode={mode} role={entryRole}>
      <RiderAuth mode={mode} entryRole={entryRole} />
    </EntryShell>
  );
}

function RiderAuth({ mode, entryRole }: { mode: RiderAuthMode; entryRole: "rider" | "driver" }) {
  const t = useTranslation();
  const router = useRouter();
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // Keep the sign-in form available immediately after explicit logout;
  // an optional session-restore check must never hide the password field.
  const [checkingSession, setCheckingSession] = useState(false);

  useEffect(() => {
    let active = true;
    let restoringSession = false;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const confirmationLanding = mode === "signin" && params.get("confirmed") === "1";
    const authErrorDescription = hashParams.get("error_description");
    const signedOutRole = explicitSignOutRole(window.localStorage);

    if (mode === "signin") {
      router.prefetch("/");
      if (params.get("created") === "1") {
        setNotice(t("accountCreatedConfirm"));
      } else if (confirmationLanding) {
        setNotice(t("entryConfirmNotice"));
      }
    }

    if (authErrorDescription) {
      setError(t(authErrorKey(authErrorDescription, "signin")));
    }

    const restoreSession = async (session: NonNullable<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]>) => {
      if (!active || restoringSession || explicitSignOutRole(window.localStorage)) return;
      restoringSession = true;

      try {
        const role = await resolveSessionRole(session);
        if (role === "driver") {
          if (window.localStorage.getItem("nexride:active-account-role") === "rider") {
            const membership = await supabase.from("account_roles").select("role")
              .eq("user_id",session.user.id).eq("role","rider").maybeSingle();
            if (!membership.error && membership.data) {
              try {
                await ensureRiderProfile(session);
                if (active) router.replace("/");
              } catch (cause) {
                if (active && cause instanceof RiderProfileBootstrapError &&
                    cause.code === "rider_profile_incomplete")
                  router.replace("/rider/complete-profile");
                else if (active) router.replace("/rider");
              }
              return;
            }
          }
          const destination = await driverResumeDestination(session);
          if (active) router.replace(destination);
          return;
        }
        if (role === "admin") {
          if (active) router.replace("/admin");
          return;
        }

        await ensureRiderProfile(session);
        if (!active || explicitSignOutRole(window.localStorage)) return;
        markAuthenticated();
        enterRider(session);
        router.replace("/");
      } catch (cause) {
        if (!active) return;

        if (cause instanceof RiderProfileBootstrapError &&
            cause.code === "rider_profile_incomplete") {
          router.replace("/rider/complete-profile");
          return;
        }
        if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
          await supabase.auth.signOut({ scope: "local" });
          if (active) {
            setError(t("riderAuthOnly"));
            setCheckingSession(false);
          }
          return;
        }

        setError(t("entryAccountNotReady"));
        setCheckingSession(false);
      } finally {
        restoringSession = false;
      }
    };

    if (signedOutRole && mode !== "reset") {
      if (mode === "signin") setCheckingSession(false);
    } else supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!active || mode === "reset" || explicitSignOutRole(window.localStorage)) return;

        if (sessionError || !data.session) {
          if (mode === "signin") setCheckingSession(false);
          return;
        }

        void restoreSession(data.session);
      })
      .catch(() => {
        if (active && mode === "signin") setCheckingSession(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === "PASSWORD_RECOVERY" && mode !== "reset") {
        router.replace("/rider/reset-password");
        return;
      }

      if (event === "SIGNED_IN" && confirmationLanding && session &&
          !explicitSignOutRole(window.localStorage)) {
        setCheckingSession(true);
        void restoreSession(session);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [mode, router]);

  function markAuthenticated() {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.removeItem(PREVIEW_ENABLED_KEY);
    } catch {}
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setNotice("");

    let navigating = false;

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.session) {
        setError(t(authErrorKey(authError, "signin")));
        return;
      }

      clearExplicitSignOut();
      const role = await resolveSessionRole(data.session);
      if (role === "driver") {
        const { data: activated, error: riderAccessError } =
          await supabase.rpc("account_activate_rider_role");
        if (riderAccessError || activated !== "ready") {
          setError("Go Offline and finish any active Driver trip before enabling Rider access.");
          return;
        }
        await ensureRiderProfile(data.session);
        window.localStorage.setItem("nexride:active-account-role", "rider");
        markAuthenticated();
        enterRider(data.session);
        navigating = true;
        router.replace("/");
        return;
      }
      if (role === "admin") {
        navigating = true;
        router.replace("/admin");
        return;
      }

      await ensureRiderProfile(data.session);
      setPassword("");
      markAuthenticated();
      enterRider(data.session);
      navigating = true;
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError &&
          cause.code === "rider_profile_incomplete") {
        navigating = true;
        router.replace("/rider/complete-profile");
      } else if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
        await supabase.auth.signOut({ scope: "local" });
        setError(t("riderAuthOnly"));
      } else if (cause instanceof RiderProfileBootstrapError) {
        setError(t("entryAccountNotReady"));
      } else {
        setError(t("authFailure"));
      }
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const name = fullName.trim();
    const mobile = normalizeEthiopianPhone(phone) || phone.trim();
    const digits = mobile.replace(/\D/g, "");

    if (name.length < 2 || name.length > 80) {
      setError("Enter your full name using 2–80 characters.");
      return;
    }

    if (!/^\+?[\d\s()-]{7,25}$/.test(mobile) || digits.length < 7 || digits.length > 15) {
      setError("Enter a valid phone number.");
      return;
    }

    if (password.length < 8) {
      setError(t("entryPasswordHelp"));
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    let navigating = false;

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: nexrideAuthRedirectUrl("/rider/sign-in?confirmed=1"),
          data: {
            role: "rider",
            full_name: name,
            phone: mobile,
          },
        },
      });

      if (signUpError) {
        setError(t(authErrorKey(signUpError, "signup")));
        return;
      }

      setPassword("");
      setConfirmPassword("");

      if (data.session) {
        await ensureRiderProfile(data.session, { fullName: name, phone: mobile });
        clearExplicitSignOut();
        markAuthenticated();
        enterRider(data.session);
        navigating = true;
        router.replace("/");
        return;
      }

      try { window.sessionStorage.setItem("nexride:verification-target", JSON.stringify({ email: email.trim().toLowerCase(), role: "rider", purpose: "signup" })); } catch { /* Verification still works with manual entry. */ }
      navigating = true;
      router.replace("/rider/verify-email");
    } catch {
      setError(t("createAccountFailure"));
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !email.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: nexrideAuthRedirectUrl("/rider/reset-password") },
      );

      if (recoveryError) {
        setError(t(authErrorKey(recoveryError, "recovery")));
        return;
      }

      setNotice(t("recoverySent"));
      try { window.sessionStorage.setItem("nexride:verification-target", JSON.stringify({ email: email.trim().toLowerCase(), role: entryRole, purpose: "recovery" })); } catch { /* Verification still works with manual entry. */ }
      router.push("/rider/verify-email");
    } catch {
      setError(t("recoveryFailure"));
    } finally {
      setBusy(false);
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    let navigating = false;

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(t(authErrorKey(updateError, "password")));
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigating = true;
        router.replace("/rider/sign-in");
        return;
      }

      const role = await resolveSessionRole(data.session);
      if (role === "driver") {
        navigating = true;
        router.replace(await driverResumeDestination(data.session));
        return;
      }
      if (role === "admin") {
        navigating = true;
        router.replace("/admin");
        return;
      }

      await ensureRiderProfile(data.session);
      clearExplicitSignOut();
      markAuthenticated();
      enterRider(data.session);
      navigating = true;
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
        await supabase.auth.signOut({ scope: "local" });
        setError(t("riderAuthOnly"));
      } else if (cause instanceof RiderProfileBootstrapError) {
        setError(t("entryAccountNotReady"));
      } else {
        setError(t("passwordUpdateFailure"));
      }
    } finally {
      if (!navigating) setBusy(false);
    }
  }

  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}

    // Exploring a preview must never remove an explicit logout barrier:
    // only a successful credential-based sign-in may restore auth access.
    enterRider(null);
    router.replace("/");
  };

  if (mode === "signin" && checkingSession) {
    return (
      <>
        <span className="nr-rider-entry-kicker">BILOO · {t("rider")}</span>
        <h1>{t("entrySignInHeadline")}</h1>
        <p>{t("startupRestoring")}</p>
        {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        <StatusBanner>{t("startupRestoring")}</StatusBanner>
      </>
    );
  }

  const nav = mode !== "reset" ? (
    <nav className="nr-rider-auth-nav" aria-label={t("entryRiderAccount")}>
      <Link href="/rider/sign-in" aria-current={mode === "signin" ? "page" : undefined}>
        {t("signIn")}
      </Link>
      <Link href="/rider/sign-up" aria-current={mode === "signup" ? "page" : undefined}>
        {t("createAccount")}
      </Link>
    </nav>
  ) : null;

  if (mode === "signup") {
    return (
      <>
        <span className="nr-rider-entry-kicker">BILOO · {t("rider")}</span>
        <h1>{t("entrySignupHeadline")}</h1>
        <p>{t("entrySignupIntro")}</p>
        <ol className="nr-signup-steps" aria-label={t("createAccount")}>
          <li aria-current={signupStep === 1 ? "step" : undefined} data-complete={signupStep === 2}><span>{signupStep === 2 ? <Icon name="check" size={16}/> : "1"}</span>{t("entryDetailsStep")}</li>
          <li aria-current={signupStep === 2 ? "step" : undefined}><span>2</span>{t("entrySecurityStep")}</li>
        </ol>
        <form className="nr-profile-form nr-auth-signup-form" onSubmit={event => {
          if (signupStep === 1) {
            event.preventDefault();
            if (!normalizeEthiopianPhone(phone)) { setError(t("entryPhoneInvalid")); return; }
            setError(""); setSignupStep(2);
            requestAnimationFrame(() => document.getElementById("rider-signup-password")?.focus());
          } else void signUp(event);
        }} aria-busy={busy}>
          {signupStep === 1 ? <>
          <InputField label={t("fullName")} autoComplete="name" required maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <InputField label={t("phoneNumber")} type="tel" inputMode="tel" autoComplete="tel" placeholder="+251 9…" required value={phone} onChange={(event) => setPhone(event.target.value)} />
          <InputField icon="mail" label={t("authEmail")} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </> : <>
          <div className="nr-signup-summary"><span><strong>{fullName}</strong><small>{email}</small></span><button type="button" onClick={() => { setSignupStep(1); setError(""); }}>{t("entryEditDetails")}</button></div>
          <label className="nr-input-field nr-auth-password-field">
            <span>{t("password")}</span>
            <div className="nr-auth-password-row"><Icon name="lock" size={20}/>
              <input
                id="rider-signup-password"
                type={showPassword ? "text" : "password"}
                aria-label={t("password")}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="rider-password-help"
              />
              <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>
                {t(showPassword ? "entryHide" : "entryShow")}
              </button>
            </div>
          </label>
          <p id="rider-password-help" className="nr-auth-helper">{t("entryPasswordHelp")}</p>
          <label className="nr-input-field nr-auth-password-field">
            <span>{t("confirmPassword")}</span>
            <div className="nr-auth-password-row"><Icon name="lock" size={20}/>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                aria-label={t("confirmPassword")}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>
                {t(showPassword ? "entryHide" : "entryShow")}
              </button>
            </div>
          </label>
          <label className="nr-auth-consent"><input type="checkbox" required disabled={busy}/><span>{t("entryAcceptTerms")} <Link href="/explore/terms">{t("entryTerms")}</Link> {t("entryTermsAnd")} <Link href="/explore/privacy">{t("entryPrivacy")}</Link>.</span></label>
          </>}
          {error && <p id="rider-signup-error" className="nr-auth-error" role="alert">{error}</p>}
          <div className="nr-auth-cta-dock">
            <Button type="submit" disabled={busy} loading={busy}>
              {t(signupStep === 1 ? "entryContinueSecurity" : busy ? "creatingAccount" : "createAccount")}
            </Button>
          </div>
        </form>
        <div className="nr-auth-divider"><span>{t("entryOr")}</span></div>
        <p className="nr-auth-switch">
          {t("alreadyHaveAccount")} <Link href="/rider/sign-in">{t("signIn")}</Link>
        </p>
        <div className="nr-auth-role-note">
          <span><Icon name="user" size={20} /></span>
          <div><strong>{t("entryRiderAccount")}</strong><small>{t("entryRiderAccountHint")}</small></div>
        </div>
        <Link className="nr-auth-role-link" href="/driver">{t("entrySwitchDriver")} <Icon name="arrow" size={16}/></Link>
      </>
    );
  }

  if (mode === "forgot") {
    return (
      <>
        <span className="nr-rider-entry-kicker">BILOO · {t(entryRole)}</span>
        {nav}
        <h1>{t("resetPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={sendRecovery} aria-busy={busy}>
          <InputField icon="mail" label={t("authEmail")} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <p className="nr-auth-error" role="alert">{error}</p>}
          {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "sendingRecovery" : "sendRecovery")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          <Link href={"/rider/verify-email?purpose=recovery&role=" + entryRole}>{t("entryCodeOption")}</Link> · <Link href={entryRole === "driver" ? "/driver/auth" : "/rider/sign-in"}>{t("signIn")}</Link>
        </p>
      </>
    );
  }

  if (mode === "reset") {
    return (
      <>
        <span className="nr-rider-entry-kicker">BILOO · {t(entryRole)}</span>
        <h1>{t("chooseNewPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={updatePassword} aria-busy={busy}>
          <PasswordField label={t("password")} autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          <p className="nr-auth-helper">{t("entryPasswordHelp")}</p>
          <PasswordField label={t("confirmPassword")} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {error && <p className="nr-auth-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "updatingPassword" : "updatePassword")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          <Link href={entryRole === "driver" ? "/rider/verify-email?purpose=recovery&role=driver" : "/rider/forgot-password"}>{t("sendRecovery")}</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <span className="nr-rider-entry-kicker">BILOO · {t("rider")}</span>
      <h1>{t("entrySignInHeadline")}</h1>
      <p>{t("entrySignInIntro")}</p>
      <form className="nr-profile-form" onSubmit={signIn} aria-busy={busy}>
        <InputField icon="mail" label={t("authEmail")} type="email" inputMode="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="nr-input-field nr-auth-password-field">
          <span>{t("password")}</span>
          <div className="nr-auth-password-row"><Icon name="lock" size={20}/>
            <input type={showPassword ? "text" : "password"} aria-label={t("password")} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{t(showPassword ? "entryHide" : "entryShow")}</button>
          </div>
        </label>
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
        <Button type="submit" disabled={busy} loading={busy}>
          {t(busy ? "signingIn" : "signIn")}
        </Button>
      </form>

      <Link className="nr-auth-inline-link" href="/rider/forgot-password">{t("forgotPassword")}</Link>

      <div className="nr-auth-divider"><span>{t("entryOr")}</span></div>

      <Link className="nr-auth-create-link" href="/rider/sign-up">
        <Icon name="plus" size={18} />
        {t("createAccount")}
      </Link>

      <div className="nr-auth-role-note">
        <span><Icon name="user" size={20} /></span>
        <div><strong>{t("entryRiderAccount")}</strong><small>{t("entryRiderAccountHint")}</small></div>
      </div>

      <Link className="nr-auth-role-link" href="/driver">{t("entrySwitchDriver")} <Icon name="arrow" size={16}/></Link>

      <details className="nr-auth-preview">
        <summary>{t("explorePreview")}</summary>
        <StatusBanner compact>{t("previewInfo")}</StatusBanner>
        <Button variant="ghost" onClick={preview} disabled={busy}>{t("explorePreview")}</Button>
      </details>
    </>
  );
}

"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryShell } from "./entry";
import { Button, Icon, InputField, StatusBanner, useTranslation } from "./ui";
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
  return (
    <EntryShell authMode={mode}>
      <RiderAuth mode={mode} />
    </EntryShell>
  );
}

function RiderAuth({ mode }: { mode: RiderAuthMode }) {
  const t = useTranslation();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkingSession, setCheckingSession] = useState(mode === "signin");

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
        setNotice("Email confirmed. Opening NexRide…");
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
              if (active) router.replace("/");
              return;
            }
          }
          if (active) router.replace("/rider");
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

        if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
          await supabase.auth.signOut({ scope: "local" });
          if (active) {
            setError(t("riderAuthOnly"));
            setCheckingSession(false);
          }
          return;
        }

        setError("Your Rider account could not be prepared. Please sign in again.");
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
        setError(t("authFailure"));
        return;
      }

      clearExplicitSignOut();
      const role = await resolveSessionRole(data.session);
      if (role === "driver") {
        const { data: activated, error: riderAccessError } = await supabase.rpc("account_activate_rider_role");
        if (riderAccessError || activated !== "ready") {
          setError("Go Offline and finish active Driver trips before enabling Rider access.");
          return;
        }
        await ensureRiderProfile(data.session);
        window.localStorage.setItem("nexride:active-account-role","rider");
        markAuthenticated();
        enterRider(data.session);
        retryStartup(false);
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
      if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
        await supabase.auth.signOut({ scope: "local" });
        setError(t("riderAuthOnly"));
      } else if (cause instanceof RiderProfileBootstrapError) {
        setError("Your Rider profile is not ready. Please try again.");
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

      navigating = true;
      router.replace("/rider/sign-in?created=1");
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
        setError("Your Rider profile is not ready. Please try again.");
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

    clearExplicitSignOut();
    enterRider(null);
    router.replace("/");
  };

  if (mode === "signin" && checkingSession) {
    return (
      <>
        <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
        <h1>Sign in</h1>
        <p>Getting your account ready…</p>
        {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        <StatusBanner>Restoring your account securely. You’ll continue automatically.</StatusBanner>
      </>
    );
  }

  const nav = mode !== "reset" ? (
    <nav className="nr-rider-auth-nav" aria-label="Rider account">
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
        <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
        <h1>{t("createAccount")}</h1>
        <p>{t("createAccountIntro")}</p>
        <form className="nr-profile-form nr-auth-signup-form" onSubmit={signUp} aria-busy={busy}>
          <InputField label={t("fullName")} autoComplete="name" required maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <InputField label={t("phoneNumber")} type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} />
          <InputField label={t("authEmail")} type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label className="nr-input-field nr-auth-password-field">
            <span>{t("password")}</span>
            <div className="nr-auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="rider-password-help"
              />
              <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <p id="rider-password-help" className="nr-auth-helper">Use at least 8 characters.</p>
          <label className="nr-input-field nr-auth-password-field">
            <span>{t("confirmPassword")}</span>
            <div className="nr-auth-password-row">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          {error && <p id="rider-signup-error" className="nr-auth-error" role="alert">{error}</p>}
          <div className="nr-auth-cta-dock">
            <Button type="submit" disabled={busy} loading={busy}>
              {t(busy ? "creatingAccount" : "createAccount")}
            </Button>
          </div>
        </form>
        <div className="nr-auth-divider"><span>or</span></div>
        <p className="nr-auth-switch">
          {t("alreadyHaveAccount")} <Link href="/rider/sign-in">{t("signIn")}</Link>
        </p>
        <div className="nr-auth-role-note">
          <span><Icon name="user" size={20} /></span>
          <div><strong>Rider account</strong><small>Book rides, save places, and manage your trips.</small></div>
        </div>
        <Link className="nr-auth-role-link" href="/driver">Driving with NexRide? <strong>Switch to Driver →</strong></Link>
      </>
    );
  }

  if (mode === "forgot") {
    return (
      <>
        <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
        {nav}
        <h1>{t("resetPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={sendRecovery} aria-busy={busy}>
          <InputField label={t("authEmail")} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          {error && <p className="nr-auth-error" role="alert">{error}</p>}
          {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "sendingRecovery" : "sendRecovery")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          <Link href="/rider/sign-in">{t("signIn")}</Link>
        </p>
      </>
    );
  }

  if (mode === "reset") {
    return (
      <>
        <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
        <h1>{t("chooseNewPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={updatePassword} aria-busy={busy}>
          <InputField label={t("password")} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          <InputField label={t("confirmPassword")} type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {error && <p className="nr-auth-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "updatingPassword" : "updatePassword")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          <Link href="/rider/forgot-password">{t("sendRecovery")}</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
      <h1>Sign in</h1>
      <p>Sign in to book a ride or manage your trips.</p>
      <form className="nr-profile-form" onSubmit={signIn} aria-busy={busy}>
        <InputField label={t("authEmail")} type="email" inputMode="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label className="nr-input-field nr-auth-password-field">
          <span>{t("password")}</span>
          <div className="nr-auth-password-row">
            <input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="button" className="nr-auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-pressed={showPassword}>{showPassword ? "Hide" : "Show"}</button>
          </div>
        </label>
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
        <Button type="submit" disabled={busy} loading={busy}>
          {t(busy ? "signingIn" : "signIn")}
        </Button>
      </form>

      <Link className="nr-auth-inline-link" href="/rider/forgot-password">{t("forgotPassword")}</Link>

      <div className="nr-auth-divider"><span>or</span></div>

      <Link className="nr-auth-create-link" href="/rider/sign-up">
        <Icon name="plus" size={18} />
        Create Rider Account
      </Link>

      <div className="nr-auth-role-note">
        <span><Icon name="user" size={20} /></span>
        <div><strong>Rider account</strong><small>Book rides, manage trips, and keep your saved places close.</small></div>
      </div>

      <Link className="nr-auth-role-link" href="/driver">Driving with NexRide? <strong>Switch to Driver →</strong></Link>

      <details className="nr-auth-preview">
        <summary>Explore without signing in</summary>
        <StatusBanner compact>{t("previewInfo")}</StatusBanner>
        <Button variant="ghost" onClick={preview} disabled={busy}>{t("explorePreview")}</Button>
      </details>
    </>
  );
}

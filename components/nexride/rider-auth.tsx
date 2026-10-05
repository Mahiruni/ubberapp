"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryShell } from "./entry";
import { Button, InputField, StatusBanner, useTranslation } from "./ui";
import { supabase } from "../../lib/supabase";
import {
  enterRider,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import { ensureRiderProfile, RiderProfileBootstrapError } from "../../lib/nexride-rider-profile-bootstrap";

export type RiderAuthMode = "signin" | "signup" | "forgot" | "reset";

function authRedirectUrl(path: string) {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const origin =
    process.env.NODE_ENV === "production" && configuredAppUrl
      ? configuredAppUrl
      : browserOrigin || configuredAppUrl;

  if (!origin) {
    throw new Error("Unable to resolve the NexRide application URL.");
  }

  return new URL(path, origin.endsWith("/") ? origin : `${origin}/`).toString();
}

export function RiderAuthScreen({ mode }: { mode: RiderAuthMode }) {
  return (
    <EntryShell>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const confirmationLanding = mode === "signin" && params.get("confirmed") === "1";
    const authErrorDescription = hashParams.get("error_description");

    if (authErrorDescription) {
      setError(authErrorDescription);
    }

    if (mode === "signin") {
      if (params.get("created") === "1") {
        setNotice(t("accountCreatedConfirm"));
      } else if (params.get("confirmed") === "1") {
        setNotice("Email confirmed. Sign in to continue.");
      }
    }

    supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!active || sessionError || !data.session || mode === "reset" || confirmationLanding) return;

        if (data.session.user.user_metadata?.role === "driver") {
          const destination = await driverResumeDestination(data.session);
          if (active) router.replace(destination);
          return;
        }

        try {
          await ensureRiderProfile(data.session);
          if (!active) return;
          enterRider(data.session);
          router.replace("/");
        } catch {
          if (active) setError("Your Rider account could not be prepared. Please sign in again.");
        }
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && mode !== "reset") {
        router.replace("/rider/reset-password");
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

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !data.session) {
        setError(t("authFailure"));
        return;
      }

      if (data.session.user.user_metadata?.role === "driver") {
        await supabase.auth.signOut();
        setError(t("riderAuthOnly"));
        return;
      }

      await ensureRiderProfile(data.session);
      setPassword("");
      markAuthenticated();
      enterRider(data.session);
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
        await supabase.auth.signOut();
        setError(t("riderAuthOnly"));
      } else if (cause instanceof RiderProfileBootstrapError) {
        setError("Your Rider profile is not ready. Please try again.");
      } else {
        setError(t("authFailure"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const name = fullName.trim();
    const mobile = phone.trim();
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

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: authRedirectUrl("/rider/sign-in?confirmed=1"),
          data: {
            role: "rider",
            full_name: name,
            phone: mobile,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message || "Unable to create your account.");
        return;
      }

      setPassword("");
      setConfirmPassword("");

      if (data.session) {
        await ensureRiderProfile(data.session, { fullName: name, phone: mobile });
        markAuthenticated();
        enterRider(data.session);
        router.replace("/");
        return;
      }

      router.replace("/rider/sign-in?created=1");
    } catch {
      setError("Unable to create your account. Check your connection and try again.");
    } finally {
      setBusy(false);
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
        { redirectTo: authRedirectUrl("/rider/reset-password") },
      );

      if (recoveryError) {
        setError("We couldn’t send the recovery email. Check the address and try again.");
        return;
      }

      setNotice(t("recoverySent"));
    } catch {
      setError("We couldn’t send the recovery email. Check your connection and try again.");
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

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError("Your password could not be updated. Request a new recovery link and try again.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/rider/sign-in");
        return;
      }

      if (data.session.user.user_metadata?.role === "driver") {
        await supabase.auth.signOut();
        setError(t("riderAuthOnly"));
        return;
      }

      await ensureRiderProfile(data.session);
      markAuthenticated();
      enterRider(data.session);
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError && cause.code === "role_conflict") {
        await supabase.auth.signOut();
        setError(t("riderAuthOnly"));
      } else if (cause instanceof RiderProfileBootstrapError) {
        setError("Your Rider profile is not ready. Please try again.");
      } else {
        setError("Your password could not be updated. Request a new recovery link and try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}

    enterRider(null);
    router.replace("/");
  };

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
        {nav}
        <h1>{t("createAccount")}</h1>
        <p>{t("createAccountIntro")}</p>
        <form className="nr-profile-form" onSubmit={signUp} aria-busy={busy}>
          <InputField label={t("fullName")} autoComplete="name" required maxLength={80} value={fullName} onChange={(event) => setFullName(event.target.value)} />
          <InputField label={t("phoneNumber")} type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} />
          <InputField label={t("authEmail")} type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <InputField label={t("password")} type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} />
          <InputField label={t("confirmPassword")} type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          {error && <p className="nr-auth-error" role="alert">{error}</p>}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "creatingAccount" : "createAccount")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          {t("alreadyHaveAccount")} <Link href="/rider/sign-in">{t("signIn")}</Link>
        </p>
        <Link className="nr-auth-role-link" href="/driver">{t("driverSignIn")}</Link>
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
      {nav}
      <h1>{t("signIn")}</h1>
      <p>{t("signInIntro")}</p>
      <form className="nr-profile-form" onSubmit={signIn} aria-busy={busy}>
        <InputField label={t("authEmail")} type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <InputField label={t("password")} type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="nr-auth-error" role="alert">{error}</p>}
        {notice && <p className="nr-auth-notice" role="status">{notice}</p>}
        <Button type="submit" disabled={busy} loading={busy}>
          {t(busy ? "signingIn" : "signIn")}
        </Button>
      </form>

      <Link className="nr-auth-inline-link" href="/rider/forgot-password">{t("forgotPassword")}</Link>

      <p className="nr-auth-switch">
        {t("needAccount")} <Link href="/rider/sign-up">{t("createAccount")}</Link>
      </p>

      <Link className="nr-auth-role-link" href="/driver">{t("driverSignIn")}</Link>

      <StatusBanner>{t("previewInfo")}</StatusBanner>
      <Button variant="ghost" onClick={preview} disabled={busy}>{t("explorePreview")}</Button>
    </>
  );
}

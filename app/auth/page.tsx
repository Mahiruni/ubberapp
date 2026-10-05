"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../components/nexride/entry";
import {
  Button,
  InputField,
  StatusBanner,
  useTranslation,
} from "../../components/nexride/ui";
import { supabase } from "../../lib/supabase";
import {
  enterRider,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import "../nexride.css";

type AuthView = "signin" | "signup" | "forgot" | "reset";

export default function Authentication() {
  return (
    <EntryShell>
      <RiderAuth />
    </EntryShell>
  );
}

function RiderAuth() {
  const t = useTranslation();
  const router = useRouter();
  const [view, setView] = useState<AuthView>("signin");
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

    if (new URLSearchParams(window.location.search).get("recovery") === "1") {
      setView("reset");
    }

    supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!active || sessionError || !data.session) return;
        if (
          new URLSearchParams(window.location.search).get("recovery") === "1"
        ) {
          setView("reset");
          return;
        }
        if (data.session.user.user_metadata?.role === "driver") {
          const destination = await driverResumeDestination(data.session);
          if (active) router.replace(destination);
          return;
        }
        enterRider(data.session);
        router.replace("/");
      })
      .catch(() => {});

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") {
        setError("");
        setNotice("");
        setView("reset");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  function clearFeedback(next: AuthView) {
    setView(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  }

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
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
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

      setPassword("");
      markAuthenticated();
      enterRider(data.session);
      router.replace("/");
    } catch {
      setError(t("authFailure"));
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
    if (
      !/^\+?[\d\s()-]{7,25}$/.test(mobile) ||
      digits.length < 7 ||
      digits.length > 15
    ) {
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
        markAuthenticated();
        enterRider(data.session);
        router.replace("/");
        return;
      }

      setNotice(t("accountCreatedConfirm"));
      setView("signin");
    } catch {
      setError("Unable to create your account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!email.trim()) return;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const redirectTo =
        window.location.origin + "/auth?recovery=1";
      const { error: recoveryError } =
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
      if (recoveryError) {
        setError(
          "We couldn’t send the recovery email. Check the address and try again.",
        );
        return;
      }
      setNotice(t("recoverySent"));
    } catch {
      setError(
        "We couldn’t send the recovery email. Check your connection and try again.",
      );
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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError("Your password could not be updated. Request a new recovery link and try again.");
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setView("signin");
        setError("");
        setPassword("");
        setConfirmPassword("");
        setNotice("Password updated. Sign in with your new password.");
        return;
      }

      if (data.session.user.user_metadata?.role === "driver") {
        await supabase.auth.signOut();
        setError(t("riderAuthOnly"));
        setView("signin");
        return;
      }

      markAuthenticated();
      enterRider(data.session);
      router.replace("/");
    } catch {
      setError("Your password could not be updated. Request a new recovery link and try again.");
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

  if (view === "signup") {
    return (
      <>
        <h1>{t("createAccount")}</h1>
        <p>{t("createAccountIntro")}</p>
        <form className="nr-profile-form" onSubmit={signUp}>
          <InputField
            label={t("fullName")}
            autoComplete="name"
            required
            maxLength={80}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
          <InputField
            label={t("phoneNumber")}
            type="tel"
            autoComplete="tel"
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <InputField
            label={t("authEmail")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <InputField
            label={t("password")}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <InputField
            label={t("confirmPassword")}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {error && (
            <p className="nr-auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="nr-auth-notice" role="status">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "creatingAccount" : "createAccount")}
          </Button>
        </form>
        <p className="nr-auth-switch">
          {t("alreadyHaveAccount")}{" "}
          <button type="button" onClick={() => clearFeedback("signin")}>
            {t("signIn")}
          </button>
        </p>
        <Link className="nr-auth-role-link" href="/driver">
          {t("driverSignIn")}
        </Link>
      </>
    );
  }

  if (view === "forgot") {
    return (
      <>
        <h1>{t("resetPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={sendRecovery}>
          <InputField
            label={t("authEmail")}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && (
            <p className="nr-auth-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="nr-auth-notice" role="status">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "sendingRecovery" : "sendRecovery")}
          </Button>
        </form>
        <button
          className="nr-auth-inline-link"
          type="button"
          onClick={() => clearFeedback("signin")}
        >
          {t("signIn")}
        </button>
      </>
    );
  }

  if (view === "reset") {
    return (
      <>
        <h1>{t("chooseNewPassword")}</h1>
        <p>{t("resetPasswordIntro")}</p>
        <form className="nr-profile-form" onSubmit={updatePassword}>
          <InputField
            label={t("password")}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <InputField
            label={t("confirmPassword")}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {error && (
            <p className="nr-auth-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} loading={busy}>
            {t(busy ? "updatingPassword" : "updatePassword")}
          </Button>
        </form>
      </>
    );
  }

  return (
    <>
      <h1>{t("signIn")}</h1>
      <p>{t("signInIntro")}</p>
      <form className="nr-profile-form" onSubmit={signIn}>
        <InputField
          label={t("authEmail")}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <InputField
          label={t("password")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && (
          <p className="nr-auth-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="nr-auth-notice" role="status">
            {notice}
          </p>
        )}
        <Button type="submit" disabled={busy} loading={busy}>
          {t(busy ? "signingIn" : "signIn")}
        </Button>
      </form>

      <button
        className="nr-auth-inline-link"
        type="button"
        onClick={() => clearFeedback("forgot")}
        disabled={busy}
      >
        {t("forgotPassword")}
      </button>

      <p className="nr-auth-switch">
        {t("needAccount")}{" "}
        <button
          type="button"
          onClick={() => clearFeedback("signup")}
          disabled={busy}
        >
          {t("createAccount")}
        </button>
      </p>

      <Link className="nr-auth-role-link" href="/driver">
        {t("driverSignIn")}
      </Link>

      <StatusBanner>{t("previewInfo")}</StatusBanner>
      <Button variant="ghost" onClick={preview} disabled={busy}>
        {t("explorePreview")}
      </Button>
    </>
  );
}

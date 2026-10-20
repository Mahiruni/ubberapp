"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RiderSplash } from "../../components/nexride/splash";

import { Button, Icon, StatusBanner, useTranslation } from "../../components/nexride/ui";
import {
  clearExplicitSignOut,
  enterRider,
  explicitSignOutRole,
  StartupError,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { ACTIVE_ACCOUNT_ROLE_KEY } from "../../lib/nexride-startup";
import { ensureRiderProfile, RiderProfileBootstrapError } from "../../lib/nexride-rider-profile-bootstrap";
import "../nexride.css";
import "./rider-entry.css";

export default function RiderWelcomePage() {
  return (
    <RiderWelcome />
  );
}

function RiderWelcome() {
  const t = useTranslation();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [returningDriver, setReturningDriver] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [switchError, setSwitchError] = useState("");

  useEffect(() => {
    let active = true;
    setCheckingSession(true);
    setStartupError(null);
    if (explicitSignOutRole(window.localStorage)) {
      setCheckingSession(false);
      return () => { active = false; };
    }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (error) throw error;
      if (!data.session) {
        setCheckingSession(false);
        return;
      }
      const accountRole = await resolveSessionRole(data.session);
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (accountRole === "driver") {
        const prefersRider = window.localStorage.getItem(ACTIVE_ACCOUNT_ROLE_KEY) === "rider";
        const membership = prefersRider
          ? await supabase.from("account_roles").select("role")
              .eq("user_id", data.session.user.id).eq("role", "rider").maybeSingle()
          : null;
        if (!prefersRider || membership?.error || membership?.data?.role !== "rider") {
          // Show a deliberate role-activation choice for a signed-in Driver;
          // do not require a new password or create a second account.
          if (active) {
            setReturningDriver(true);
            setCheckingSession(false);
          }
          return;
        }
      }
      try {
        await ensureRiderProfile(data.session);
        if (!active || explicitSignOutRole(window.localStorage)) return;
        enterRider(data.session);
        router.replace("/");
      } catch (cause) {
        if (!active) return;
        if (cause instanceof RiderProfileBootstrapError &&
          cause.code === "rider_profile_incomplete") {
          router.replace("/rider/complete-profile");
        } else {
          setStartupError(new StartupError("session"));
        }
      }
    }).catch(() => {
      if (active) setStartupError(new StartupError("session"));
    });
    return () => {
      active = false;
    };
  }, [router, attempt]);

  const continueAsRider = async () => {
    if (switchingRole) return;
    setSwitchingRole(true);
    setSwitchError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.push("/rider/sign-in");
        return;
      }
      const { data: activated, error: activationError } = await supabase.rpc("account_activate_rider_role");
      if (activationError || activated !== "ready") {
        setSwitchError(t("entryRoleSwitchBlocked"));
        return;
      }
      await ensureRiderProfile(data.session);
      clearExplicitSignOut();
      window.localStorage.setItem(ACTIVE_ACCOUNT_ROLE_KEY, "rider");
      enterRider(data.session);
      router.replace("/");
    } catch (cause) {
      if (cause instanceof RiderProfileBootstrapError &&
        cause.code === "rider_profile_incomplete") {
        router.push("/rider/complete-profile");
      } else {
        setSwitchError(t("entryRoleSwitchUnavailable"));
      }
    } finally {
      setSwitchingRole(false);
    }
  };

  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}
    // Preview is not authentication; keep the post-logout restoration barrier.
    enterRider(null);
    router.replace("/");
  };

  if (checkingSession) {
    return <RiderSplash error={startupError} onRetry={() => setAttempt(value => value + 1)}/>;
  }

  return (
    <main className="nr-rider-welcome biloo-rider-campaign">
      <header className="biloo-rider-brand"><img src="/brand/biloo-mark.svg" alt="" /><strong>biloo</strong><span>RIDES FOR A BETTER TOMORROW</span></header>
      <section className="biloo-rider-heading"><h1>Your Ride<br/>is Here</h1><p>Safe. Reliable. Affordable.<br/>Across Addis Ababa.</p></section>
      <div className="biloo-rider-photo" role="img" aria-label="Biloo Rider: a woman approaches a white Biloo car in Addis Ababa with a welcoming driver" />
      <div className="nr-rider-welcome-intro" hidden>
        <span className="nr-rider-entry-kicker">
          <Icon name="navigation" size={15} />
          BILOO · {t("rider")}
        </span>
        <h1>{t("entryWelcomeTitle")}</h1>
        <p>{t("entryWelcomeIntro")}</p>
      </div>

      {returningDriver && <div className="nr-auth-role-note" role="status">
        <Icon name="check" size={20} />
        <div><strong>{t("entryWelcomeRider")}</strong><small>{t("entryReturningDriver")}</small></div>
      </div>}
      {switchError && <p className="nr-auth-error" role="alert">{switchError}</p>}
      <div className="nr-rider-entry-actions">
        {returningDriver ? (
          <button className="nr-rider-get-started" type="button" disabled={switchingRole}
            onClick={() => void continueAsRider()}>
            <span>{switchingRole ? t("entryPreparingRider") : t("entryContinue")}</span>
            <Icon name="arrow" size={20} />
          </button>
        ) : <Link className="nr-rider-get-started" href="/rider/sign-up">
          <span>{t("entryGetStarted")}</span>
          <Icon name="arrow" size={20} />
        </Link>}
        {!returningDriver && <Link className="biloo-rider-register" href="/rider/sign-up">{t("createAccount")}</Link>}
        <Link className="nr-rider-welcome-sign-in" href={returningDriver ? "/driver/home" : "/rider/sign-in"}>
          <span>{returningDriver ? t("entryReturnDriver") : t("alreadyHaveAccount")}</span>
          <Icon name="chevron" size={19} />
        </Link>
      </div>

      <div className="nr-rider-welcome-footer">
        <details className="nr-rider-preview-disclosure">
          <summary>{t("explorePreview")}</summary>
          <StatusBanner compact>{t("previewInfo")}</StatusBanner>
          <Button variant="ghost" onClick={preview}>{t("explorePreview")}</Button>
        </details>
        <p className="nr-rider-driver-link">
          <Link href="/driver">{t("driverSignIn")}</Link>
        </p>
      </div>
    </main>
  );
}

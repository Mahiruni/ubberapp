"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EntryShell } from "../../components/nexride/entry";
import { Button, Icon, StatusBanner, useTranslation } from "../../components/nexride/ui";
import {
  clearExplicitSignOut,
  enterRider,
  explicitSignOutRole,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import { ACTIVE_ACCOUNT_ROLE_KEY } from "../../lib/nexride-startup";
import { ensureRiderProfile } from "../../lib/nexride-rider-profile-bootstrap";
import "../nexride.css";
import "./rider-entry.css";

export default function RiderWelcomePage() {
  return (
    <EntryShell>
      <RiderWelcome />
    </EntryShell>
  );
}

function RiderWelcome() {
  const t = useTranslation();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);
  const [returningDriver, setReturningDriver] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [switchError, setSwitchError] = useState("");

  useEffect(() => {
    let active = true;
    if (explicitSignOutRole(window.localStorage)) {
      setCheckingSession(false);
      return () => { active = false; };
    }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (error || !data.session) {
        setCheckingSession(false);
        return;
      }
      const accountRole = await resolveSessionRole(data.session).catch(() => "");
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
      } catch {
        if (active) setCheckingSession(false);
      }
    }).catch(() => {
      if (active) setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

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
        setSwitchError("Please go Offline and complete any active Driver trip before switching to Rider.");
        return;
      }
      await ensureRiderProfile(data.session);
      clearExplicitSignOut();
      window.localStorage.setItem(ACTIVE_ACCOUNT_ROLE_KEY, "rider");
      enterRider(data.session);
      router.replace("/");
    } catch {
      setSwitchError("Unable to confirm Rider access right now. Please try again.");
    } finally {
      setSwitchingRole(false);
    }
  };

  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}
    clearExplicitSignOut();
    enterRider(null);
    router.replace("/");
  };

  if (checkingSession) {
    return <div className="nr-rider-entry-restoring" role="status" aria-live="polite">{t("startupRestoring")}</div>;
  }

  return (
    <div className="nr-rider-welcome">
      <div className="nr-rider-welcome-intro">
        <span className="nr-rider-entry-kicker">
          <Icon name="navigation" size={15} />
          NEXRIDE · RIDER
        </span>
        <h1>{t("welcome")}</h1>
        <p>{t("brandMessage")}</p>
      </div>

      <div className="nr-rider-entry-benefits" aria-label="Rider experience">
        <span><Icon name="pin" size={18} /> Pickup & drop-off</span>
        <span><Icon name="navigation" size={18} /> Ride choices</span>
        <span><Icon name="shield" size={18} /> Safety first</span>
      </div>

      {returningDriver && <div className="nr-auth-role-note" role="status">
        <Icon name="check" size={20} />
        <div><strong>Welcome to NexRide Rider</strong><small>Already driving with NexRide? Use your existing account to start riding.</small></div>
      </div>}
      {switchError && <p className="nr-auth-error" role="alert">{switchError}</p>}
      <div className="nr-rider-entry-actions">
        {returningDriver ? (
          <button className="nr-rider-get-started" type="button" disabled={switchingRole}
            onClick={() => void continueAsRider()}>
            <span>{switchingRole ? "Preparing Rider access…" : "Continue with NexRide"}</span>
            <Icon name="arrow" size={20} />
          </button>
        ) : <Link className="nr-rider-get-started" href="/rider/sign-up">
          <span>{t("createAccount")}</span>
          <Icon name="arrow" size={20} />
        </Link>}
        <Link className="nr-rider-welcome-sign-in" href={returningDriver ? "/driver/home" : "/rider/sign-in"}>
          <span>{returningDriver ? "Return to Driver" : t("signIn")}</span>
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
    </div>
  );
}

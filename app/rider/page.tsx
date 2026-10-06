"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EntryPhoto, EntryShell } from "../../components/nexride/entry";
import { Button, Icon, StatusBanner, useTranslation } from "../../components/nexride/ui";
import {
  enterRider,
  ONBOARDING_KEY,
  PREVIEW_ENABLED_KEY,
} from "../../lib/nexride-startup";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import { ensureRiderProfile } from "../../lib/nexride-rider-profile-bootstrap";
import "../nexride.css";
import "./rider-entry.css";

export default function RiderWelcomePage() {
  return (
    <EntryShell photoCredit>
      <RiderWelcome />
    </EntryShell>
  );
}

function RiderWelcome() {
  const t = useTranslation();
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setCheckingSession(false);
        return;
      }
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
        if (active) setCheckingSession(false);
      }
    }).catch(() => {
      if (active) setCheckingSession(false);
    });
    return () => {
      active = false;
    };
  }, [router]);

  const preview = () => {
    try {
      localStorage.setItem(ONBOARDING_KEY, "true");
      localStorage.setItem(PREVIEW_ENABLED_KEY, "true");
    } catch {}
    enterRider(null);
    router.replace("/");
  };

  if (checkingSession) {
    return <div className="nr-rider-entry-restoring" role="status" aria-live="polite">{t("startupRestoring")}</div>;
  }

  return (
    <div className="nr-rider-welcome">
      <span className="nr-rider-entry-kicker">NEXRIDE · RIDER</span>
      <h1>{t("welcome")}</h1>
      <p>{t("brandMessage")}</p>
      <EntryPhoto />

      <div className="nr-rider-entry-benefits" aria-label="Rider experience">
        <span><Icon name="pin" size={18} /> Pickup & destination</span>
        <span><Icon name="navigation" size={18} /> Ride choices</span>
        <span><Icon name="shield" size={18} /> Safety & support</span>
      </div>

      <p>{t("onboardingIntro")}</p>

      <div className="nr-rider-entry-actions">
        <Link className="nr-button nr-primary" href="/rider/sign-up">{t("createAccount")}</Link>
        <Link className="nr-button nr-secondary" href="/rider/sign-in">{t("signIn")}</Link>
      </div>

      <StatusBanner>{t("previewInfo")}</StatusBanner>
      <Button variant="ghost" onClick={preview}>{t("explorePreview")}</Button>

      <p className="nr-rider-driver-link">
        <Link href="/driver">{t("driverSignIn")}</Link>
      </p>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { RiderSplash } from "../../components/nexride/splash";
import { useTranslation } from "../../components/nexride/ui";
import { supabase } from "../../lib/supabase";
import { enterDriver, explicitSignOutRole, StartupError } from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import "./driver-welcome.css";
import "../detail-system.css";

export default function DriverWelcome() {
  const router = useRouter();
  const t = useTranslation();
  const [checking, setChecking] = useState(true);
  const [startupError, setStartupError] = useState<StartupError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setChecking(true);
    setStartupError(null);
    if (explicitSignOutRole(window.localStorage)) {
      setChecking(false);
      return () => { active = false; };
    }
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (error) throw error;
      const session = data.session;
      const role = session ? await resolveSessionRole(session) : "";
      if (session && role === "driver") {
        enterDriver(session);
        const destination = await driverResumeDestination(session);
        if (active && !explicitSignOutRole(window.localStorage)) router.replace(destination);
        return;
      }
      setChecking(false);
    }).catch(() => { if (active) setStartupError(new StartupError("session")); });
    return () => { active = false; };
  }, [router, attempt]);

  if (checking) return <RiderSplash error={startupError} onRetry={() => setAttempt(value => value + 1)}/>;

  return <main className="biloo-driver-campaign" aria-label="Biloo Driver welcome">
    <div className="biloo-driver-photo" role="img" aria-label="Biloo Driver Addis Ababa campaign photography"/>
    <section className="biloo-driver-panel">
      <img className="biloo-driver-logo" src="/brand/biloo-mark.svg" alt="Biloo official logo" />
      <h1>Biloo <span>Driver</span></h1>
      <p>Drive with Biloo. Earn more. Drive with confidence.</p>
      <div className="biloo-driver-actions">
        <Link href="/driver/auth" className="biloo-driver-signin">{t("signIn")} <span aria-hidden="true">→</span></Link>
        <Link href="/driver/onboarding" className="biloo-driver-register">{t("register")} <span aria-hidden="true">→</span></Link>
      </div>
      <div className="biloo-driver-secondary"><Link href="/rider">Switch to Rider</Link></div>
    </section>
  </main>;
}

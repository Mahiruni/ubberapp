"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { EntryShell } from "../../components/nexride/entry";
import { RiderSplash } from "../../components/nexride/splash";
import { Icon, useTranslation } from "../../components/nexride/ui";
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

  return <EntryShell role="driver">
    <span className="driver-auth-role">NEXRIDE · {t("driver")}</span>
    <h1>{t("entryDriveHeadline")}</h1>
    <p>{t("entryDriverIntro")}</p>
    <div className="nr-rider-entry-actions"><Link className="nr-rider-get-started" href="/driver/onboarding">{t("entryGetStarted")}<Icon name="arrow" size={20}/></Link><Link className="nr-rider-welcome-sign-in" href="/driver/auth">{t("signIn")}</Link></div>
    <div className="nr-auth-role-note"><span><Icon name="user" size={20}/></span><div><strong>{t("entryOneAccount")}</strong><small>{t("entryExistingIdentity")}</small></div></div>
    <Link className="nr-auth-role-link" href="/rider">{t("entrySwitchRider")}<Icon name="arrow" size={16}/></Link>
  </EntryShell>;
}

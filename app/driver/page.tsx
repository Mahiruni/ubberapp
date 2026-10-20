"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RiderSplash } from "../../components/nexride/splash";
import { supabase } from "../../lib/supabase";
import { enterDriver, explicitSignOutRole, StartupError } from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../lib/nexride-account-role";
import "./driver-welcome.css";
import "../detail-system.css";

export default function DriverWelcome() {
  const router = useRouter();
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
      if (active) setChecking(false);
    }).catch(() => { if (active) setStartupError(new StartupError("session")); });
    return () => { active = false; };
  }, [router, attempt]);

  if (checking) return <RiderSplash error={startupError} onRetry={() => setAttempt(value => value + 1)} />;

  return <main className="biloo-driver-campaign biloo-driver-campaign--2026" aria-label="Biloo Driver welcome">
    <img className="biloo-driver-image" src="/nexride/screens/assets/driver.png" alt="Biloo driver beside a white branded car" loading="eager" fetchPriority="high" decoding="async" />
    <section className="biloo-driver-bottom" aria-label="Driver access">
      <Link href="/driver/onboarding" className="biloo-driver-primary">Get Started <span aria-hidden="true">→</span></Link>
      <div className="biloo-driver-action-row">
        <Link href="/driver/auth" className="biloo-driver-secondary-action">Sign In</Link>
        <Link href="/driver/onboarding" className="biloo-driver-register-action">Register</Link>
      </div>
      <nav className="biloo-driver-links" aria-label="Helpful links">
        <Link href="/support?role=driver">Help &amp; Support</Link>
        <Link href="/rider">Rider App</Link>
      </nav>
    </section>
  </main>;
}

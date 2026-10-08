"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "../../components/nexride/ui";
import { supabase } from "../../lib/supabase";
import { enterDriver, explicitSignOutRole } from "../../lib/nexride-startup";
import { driverResumeDestination } from "../../lib/nexride-driver-verification";
import "./driver-welcome.css";
import "../detail-system.css";

export default function DriverWelcome() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    if (explicitSignOutRole(window.localStorage)) {
      setChecking(false);
      return () => { active = false; };
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || explicitSignOutRole(window.localStorage)) return;
      const session = data.session;
      const role = session?.user?.user_metadata?.role;
      if (session && role === "driver") {
        enterDriver(session);
        const destination = await driverResumeDestination(session);
        if (active && !explicitSignOutRole(window.localStorage)) router.replace(destination);
        return;
      }
      setChecking(false);
    }).catch(() => active && setChecking(false));
    return () => { active = false; };
  }, [router]);

  if (checking) return <div className="driver-welcome driver-welcome-loading" aria-busy="true" />;

  return (
    <main className="driver-welcome">
      <div className="driver-welcome-media" aria-hidden="true"><Image src="/images/addis-skyline.webp" alt="" fill priority sizes="100vw" className="driver-city" /><div className="driver-welcome-gradient" /></div>
      <section className="driver-welcome-content">
        <div className="driver-welcome-top"><Brand driver /><span className="driver-role-badge">DRIVER</span></div>
        <div className="driver-welcome-copy"><div className="driver-mark" aria-hidden="true">N</div><p className="driver-eyebrow">NEXRIDE · DRIVER</p><h1>Drive. Earn. Grow.</h1><p className="driver-subtitle">Work on your schedule and keep every trip clearly organized.</p></div>
        <div className="driver-welcome-actions"><Link className="driver-get-started" href="/driver/onboarding">Get started</Link><Link className="driver-sign-in" href="/driver/auth">I already have an account</Link><p className="driver-role-note">Looking for a ride? · <Link href="/rider/sign-in">Rider sign in</Link></p></div>
      </section>
    </main>
  );
}

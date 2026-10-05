"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import { supabase } from "../../../lib/supabase";
import "../../../app/nexride.css";
import "../../../app/driver/driver-dashboard.css";

export default function DriverHomePage() {
  const router = useRouter();
  const [screen, setScreen] = useState<DriverScreen>("home");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const session = data.session;
      const role = session?.user?.user_metadata?.role;
      if (!session || role !== "driver") {
        router.replace("/driver/auth");
        return;
      }
      if (session.user.user_metadata?.driver_onboarding_complete !== true) {
        router.replace("/driver/onboarding");
        return;
      }
      setChecking(false);
    }).catch(() => router.replace("/driver/auth"));
    return () => { active = false; };
  }, [router]);

  if (checking) return <main className="nr-app nr-driver-shell"><div className="nr-driver-page"><div className="nr-driver-card nr-driver-loading"><span className="nr-driver-skeleton wide" /><span className="nr-driver-skeleton" /><span className="nr-driver-skeleton" /></div></div></main>;

  return <main className="nr-app nr-driver-shell" data-mode="driver" data-theme="dark"><DriverWorkspace screen={screen} navigate={setScreen} onSafety={() => setScreen("profile")} /></main>;
}

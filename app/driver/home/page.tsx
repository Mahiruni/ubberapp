"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import { registerNexRideBackHandler } from "../../../lib/nexride-native-navigation";
import { supabase } from "../../../lib/supabase";
import { explicitSignOutRole, StartupError } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { withOperationTimeout } from "../../../lib/nexride-operation";
import { RiderSplash } from "../../../components/nexride/splash";
import "../../../app/nexride.css";
import "../../../app/driver/driver-dashboard.css";
import "../../detail-system.css";

export default function DriverHomePage() {
  const router = useRouter();
  const [screen, setScreen] = useState<DriverScreen>("home");
  useEffect(() => registerNexRideBackHandler(() => {
    if (screen !== "map") return false;
    setScreen("home");
    return true;
  }, 20), [screen]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<StartupError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const requestedScreen = new URLSearchParams(window.location.search).get("screen");
    if (requestedScreen === "earnings") {
      router.replace("/driver/earnings");
      return;
    }
    if (requestedScreen === "profile") {
      router.replace("/driver/profile");
      return;
    }
    if (requestedScreen === "map") {
      router.replace("/driver/map");
      return;
    }

    let active = true;
    setChecking(true);
    setError(null);
    if (explicitSignOutRole(window.localStorage)) {
      router.replace("/driver/auth?logged_out=1");
      return () => { active = false; };
    }
    withOperationTimeout(supabase.auth.getSession()).then(async ({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (!active || explicitSignOutRole(window.localStorage)) return;
      const session = data.session;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const role = await resolveSessionRole(session);
      if (!active || explicitSignOutRole(window.localStorage)) return;
      const destination = await driverResumeDestination(session, role);
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (destination !== "/driver/home") {
        router.replace(destination);
        return;
      }
      setChecking(false);
    }).catch(() => { if (active) setError(new StartupError("session")); });

    return () => { active = false; };
  }, [router, attempt]);

  if (checking) return <RiderSplash error={error} onRetry={() => setAttempt(value => value + 1)} />;

  const navigate = (next: DriverScreen) => {
    if (next === "home") setScreen("home");
    else if (next === "map") router.push("/driver/map");
    else if (next === "earnings") router.push("/driver/earnings");
    else router.push("/driver/profile");
  };

  return <main className="nr-app nr-driver-shell" data-mode="driver"><DriverWorkspace screen={screen} navigate={navigate} onSafety={() => router.push("/safety?role=driver")} /></main>;
}

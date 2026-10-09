"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import { supabase } from "../../../lib/supabase";
import { explicitSignOutRole } from "../../../lib/nexride-startup";
import { driverResumeDestination } from "../../../lib/nexride-driver-verification";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import "../../../app/nexride.css";
import "../../../app/driver/driver-dashboard.css";
import "../../detail-system.css";

export default function DriverHomePage() {
  const router = useRouter();
  const [screen, setScreen] = useState<DriverScreen>("home");
  const [checking, setChecking] = useState(true);

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
    if (requestedScreen === "map") setScreen("map");

    let active = true;
    if (explicitSignOutRole(window.localStorage)) {
      router.replace("/driver/auth?logged_out=1");
      return () => { active = false; };
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active || explicitSignOutRole(window.localStorage)) return;
      const session = data.session;
      if (!session) {
        router.replace("/driver/auth");
        return;
      }

      const role = await resolveSessionRole(session);
      if (!active || explicitSignOutRole(window.localStorage)) return;
      if (role === "admin") {
        router.replace("/admin");
        return;
      }
      if (role !== "driver") {
        router.replace("/");
        return;
      }
      // Onboarding and approval are separate server-owned states. Never
      // grant access solely because user metadata says onboarding is complete.
      const destination = await driverResumeDestination(session);
      if (!active) return;
      if (destination !== "/driver/home") {
        router.replace(destination);
        return;
      }
      setChecking(false);
    }).catch(() => router.replace("/driver/auth"));

    return () => { active = false; };
  }, [router]);

  if (checking) return <main className="nr-app nr-driver-shell"><div className="nr-driver-page"><div className="nr-driver-card nr-driver-loading"><span className="nr-driver-skeleton wide" /><span className="nr-driver-skeleton" /><span className="nr-driver-skeleton" /></div></div></main>;

  const navigate = (next: DriverScreen) => {
    if (next === "home") setScreen("home");
    else if (next === "map") setScreen("map");
    else if (next === "earnings") router.push("/driver/earnings");
    else router.push("/driver/profile");
  };

  return <main className="nr-app nr-driver-shell" data-mode="driver"><DriverWorkspace screen={screen} navigate={navigate} onSafety={() => router.push("/safety?role=driver")} /></main>;
}

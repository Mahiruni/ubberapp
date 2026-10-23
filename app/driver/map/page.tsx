"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import { supabase } from "../../../lib/supabase";
import { explicitSignOutRole } from "../../../lib/nexride-startup";
import { resolveSessionRole } from "../../../lib/nexride-account-role";
import { getDriverReviewStatus } from "../../../lib/nexride-driver-verification";
import "../../nexride.css";
import "../driver-dashboard.css";
import "../../detail-system.css";

/** A dedicated live map with the same verified entry rules as Driver Home.
 * Maps never expose personalized data without a valid Driver session.
 */
export default function DriverMapPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    if (explicitSignOutRole(window.localStorage)) {
      router.replace("/driver/auth?logged_out=1");
      return () => { mounted = false; };
    }
    const verify = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;
        if (sessionError) throw sessionError;
        if (!data.session) {
          router.replace("/driver/auth");
          return;
        }
        // Run independent authorization and verification reads together
        // instead of serializing two network round-trips on every map open.
        const [role, reviewStatus] = await Promise.all([
          resolveSessionRole(data.session),
          getDriverReviewStatus(data.session.user.id).catch(() => null),
        ]);
        if (!mounted) return;
        if (role !== "driver") {
          router.replace(role === "admin" ? "/admin" : "/");
          return;
        }
        if (data.session.user.user_metadata?.driver_onboarding_complete !== true) {
          router.replace("/driver/onboarding");
          return;
        }
        if (reviewStatus === "draft" || reviewStatus === "rejected") {
          router.replace("/driver/verification");
          return;
        }
        setChecking(false);
      } catch {
        if (mounted) {
          setError("We couldn't verify your Driver session. Check your connection and try again.");
          setChecking(false);
        }
      }
    };
    void verify();
    return () => { mounted = false; };
  }, [router]);

  const navigate = (screen: DriverScreen) => {
    if (screen === "map") return;
    if (screen === "earnings") router.push("/driver/earnings");
    else if (screen === "profile") router.push("/driver/profile");
    else router.push("/driver/home");
  };

  if (checking) return (
    <main className="nr-app nr-driver-shell" data-mode="driver" aria-busy="true">
      <div className="biloo-driver-map-gate" role="status" aria-label="Loading driver map">
        <span className="biloo-driver-map-gate__spinner" aria-hidden="true" />
        <span>Preparing your map…</span>
      </div>
    </main>
  );

  if (error) return (
    <main className="nr-app nr-driver-shell" data-mode="driver">
      <div className="biloo-driver-map-gate" role="alert">
        <strong>Connection required</strong>
        <p>{error}</p>
        <button type="button" onClick={() => window.location.reload()}>Try again</button>
      </div>
    </main>
  );

  return (
    <main className="nr-app nr-driver-shell" data-mode="driver">
      <DriverWorkspace screen="map" navigate={navigate} onSafety={() => router.push("/safety?role=driver")} />
    </main>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import "../../nexride.css";
import "../driver-dashboard.css";

export default function DriverProfileEntryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/driver/home?screen=profile");
  }, [router]);

  return (
    <main className="nr-app nr-driver-shell" data-mode="driver" data-theme="dark">
      <div className="nr-driver-page">
        <div className="nr-driver-card nr-driver-loading" aria-busy="true">
          <span className="nr-driver-skeleton wide" />
          <span className="nr-driver-skeleton" />
          <span className="nr-driver-skeleton" />
        </div>
      </div>
    </main>
  );
}

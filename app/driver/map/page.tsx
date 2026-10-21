"use client";

import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import "../../nexride.css";
import "../driver-dashboard.css";
import "../../detail-system.css";

/** Use the shared Driver shell; actual GPS and presence remain server-driven. */
export default function DriverMapPage() {
  const router = useRouter();
  const navigate = (screen: DriverScreen) => {
    if (screen === "map") return;
    if (screen === "earnings") router.push("/driver/earnings");
    else if (screen === "profile") router.push("/driver/profile");
    else router.push("/driver/home");
  };
  return (
    <main className="nr-app nr-driver-shell" data-mode="driver">
      <DriverWorkspace screen="map" navigate={navigate} onSafety={() => router.push("/safety?role=driver")} />
    </main>
  );
}

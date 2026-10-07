"use client";

import { useRouter } from "next/navigation";
import { DriverWorkspace, type DriverScreen } from "../../../components/nexride/driver";
import "../../nexride.css";
import "../driver-dashboard.css";
import "../../detail-system.css";

export default function DriverEarningsPage() {
  const router = useRouter();
  const navigate = (screen: DriverScreen) => {
    if (screen === "home") router.push("/driver/home");
    else if (screen === "earnings") router.push("/driver/earnings");
    else if (screen === "profile") router.push("/driver/profile");
    else router.push("/driver/home?screen=map");
  };
  return <main className="nr-app nr-driver-shell" data-mode="driver"><DriverWorkspace screen="earnings" navigate={navigate} onSafety={() => router.push("/safety?role=driver")} /></main>;
}

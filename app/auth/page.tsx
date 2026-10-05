"use client";

import { useEffect, useState } from "react";
import { RiderAuthScreen, type RiderAuthMode } from "../../components/nexride/rider-auth";
import "../nexride.css";
import "../rider/rider-entry.css";

export default function Authentication() {
  const [mode, setMode] = useState<RiderAuthMode>("signin");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("recovery") === "1") {
      setMode("reset");
    }
  }, []);

  return <RiderAuthScreen mode={mode} />;
}

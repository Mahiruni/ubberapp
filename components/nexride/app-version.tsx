"use client";

import { useEffect, useState } from "react";
import { version } from "../../package.json";

/** The installed Android version is read from the package, never guessed. */
export function AppVersion() {
  const [label, setLabel] = useState(`Web · ${version}`);
  useEffect(() => {
    let active = true;
    void Promise.all([import("@capacitor/core"), import("@capacitor/app")]).then(async ([{ Capacitor }, { App }]) => {
      if (!Capacitor.isNativePlatform()) return;
      const info = await App.getInfo();
      if (active) setLabel(`v${info.version} · ${info.build}`);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <small className="nr-app-version">{label}</small>;
}

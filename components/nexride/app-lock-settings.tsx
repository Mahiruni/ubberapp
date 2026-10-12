"use client";

import { useContext, useEffect, useState } from "react";
import { LanguageContext } from "./ui";
import { getAppLockStatus, openAppLockSettings, lockNexRideNow, type AppLockStatus } from "../../lib/nexride-app-lock";

export function AppLockSettings() {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === "am" ? am : en;
  const [status, setStatus] = useState<AppLockStatus | null>(null);
  const [available, setAvailable] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => void getAppLockStatus().then(value => {
      if (alive) { setStatus(value); setAvailable(value !== null); }
    }).catch(() => { if (alive) setUpgrade(true); });
    refresh(); window.addEventListener("focus", refresh);
    // Native settings are a screen above the WebView, so poll only while this
    // small settings panel is mounted to reflect a completed native change.
    const timer = window.setInterval(refresh, 5000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const open = async () => {
    setBusy(true); setMessage("");
    try { await openAppLockSettings(language); }
    catch (error) {
      setMessage(error instanceof Error && error.message === "sign_in_required"
        ? say("Sign in to your NexRide account first.", "መጀመሪያ ወደ NexRide መለያዎ ይግቡ።")
        : say("Update the Android app and try again.", "የAndroid መተግበሪያውን ያዘምኑ እና እንደገና ይሞክሩ።"));
    } finally { setBusy(false); }
  };
  const lockLabel = !status?.enabled ? say("Off", "ጠፍቷል") :
    (status.method === "pattern" ? say("Pattern", "ንድፍ") : "PIN") +
    (status.biometricEnabled ? say(" + biometrics", " + ባዮሜትሪክ") : say(" enabled", " በርቷል"));
  return <section className="nr-permission-settings" aria-label={say("App Lock", "የመተግበሪያ ቁልፍ")}>
    <div className="nr-lock-summary">
      <div><strong>{say("App Lock", "የመተግበሪያ ቁልፍ")}</strong><small>{available ? lockLabel : say("Android app required", "የAndroid መተግበሪያ ያስፈልጋል")}</small></div>
      {available && <button type="button" onClick={() => void open()} disabled={busy}>{busy ? say("Opening…", "በመክፈት ላይ…") : say(status?.enabled ? "Manage" : "Set up", status?.enabled ? "አስተዳድር" : "አዘጋጅ")}</button>}
    </div>
    {available && status?.enabled && <dl className="nr-lock-details">
      <div><dt>{say("Unlock method", "የመክፈቻ ዘዴ")}</dt><dd>{status.method === "pattern" ? say("Pattern", "ንድፍ") : "PIN"}</dd></div>
      <div><dt>{say("Face / fingerprint", "ፊት / የጣት አሻራ")}</dt><dd>{status.biometricEnabled ? say("Enabled", "በርቷል") : status.biometricAvailable ? say("Available", "ይገኛል") : say("Unavailable", "አይገኝም")}</dd></div>
      <div><dt>{say("Lock after leaving", "ከወጡ በኋላ ቆልፍ")}</dt><dd>{status.timeout === 0 ? say("Immediately", "ወዲያውኑ") : status.timeout === 30000 ? say("30 seconds", "30 ሰከንድ") : status.timeout === 60000 ? say("1 minute", "1 ደቂቃ") : say("5 minutes", "5 ደቂቃ")}</dd></div>
    </dl>}
    {!available && <p className="nr-muted">{upgrade ? say("Install the latest NexRide Android APK to enable app lock.", "የመተግበሪያ ቁልፍን ለማብራት የቅርብ NexRide Android APK ይጫኑ።") : say("PIN, pattern and supported biometrics are available in the Android app. Browser and iOS locks are not enabled.", "PIN፣ ንድፍ እና ባዮሜትሪክ በAndroid መተግበሪያ ይገኛሉ። በአሳሽ እና iOS አልበራም።")}</p>}
    {available && status?.enabled && <button type="button" onClick={() => {
      void lockNexRideNow().catch(() => setMessage(say("Could not lock. Update the app and try again.", "መቆለፍ አልተቻለም። መተግበሪያውን ያዘምኑ።")));
    }}>{say("Lock now", "አሁን ቆልፍ")}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}

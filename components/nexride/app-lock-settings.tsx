"use client";

import { useContext, useEffect, useState } from "react";
import { LanguageContext, Icon } from "./ui";
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
        ? say("Sign in to your Biloo account first.", "መጀመሪያ ወደ Biloo መለያዎ ይግቡ።")
        : say("Update the Android app and try again.", "የAndroid መተግበሪያውን ያዘምኑ እና እንደገና ይሞክሩ።"));
    } finally { setBusy(false); }
  };
  return <section className="nr-permission-settings" aria-label={say("App Lock", "የመተግበሪያ ቁልፍ")}>
    <div className="nr-settings-block">
      <div><strong><Icon name="shield" size={20} /> {say("App Lock", "የመተግበሪያ ቁልፍ")}</strong>
        <small>{say("Protect Biloo on this device.", "Bilooን በዚህ መሣሪያ ይጠብቁ።")}</small>
        <small>{available ? status?.enabled
          ? say(`On · ${status.method === "pattern" ? "Pattern" : "PIN"}${status.biometricEnabled ? " + biometrics" : ""}`, "በርቷል · " + (status.method === "pattern" ? "ንድፍ" : "PIN") + (status.biometricEnabled ? " + ባዮሜትሪክ" : ""))
          : say("Off · PIN, pattern and supported face / fingerprint unlock", "ጠፍቷል · PIN፣ ንድፍ እና የፊት / የጣት አሻራ")
          : upgrade ? say("Install the latest Biloo Android APK to enable app lock.", "የመተግበሪያ ቁልፍን ለማብራት የቅርብ Biloo Android APK ይጫኑ።")
          : say("Available in the Biloo Android app. Browser and iOS app locks are not enabled.", "በBiloo Android መተግበሪያ ይገኛል። በአሳሽ እና iOS አልበራም።")}</small>
      </div>
      {available && <button type="button" onClick={() => void open()} disabled={busy}
        style={{ background: "var(--nr-primary, #5145e5)", color: "#fff", border: 0, borderRadius: 14, minHeight: 48, padding: "12px 18px" }}>
        {busy ? say("Opening…", "በመክፈት ላይ…") : say(status?.enabled ? "Manage" : "Enable", status?.enabled ? "አስተዳድር" : "አብራ")}
      </button>}
    </div>
    {available && status?.enabled && <button type="button" onClick={() => {
      void lockNexRideNow().catch(() => setMessage(say("Could not lock. Update the app and try again.", "መቆለፍ አልተቻለም። መተግበሪያውን ያዘምኑ።")));
    }}>{say("Lock now", "አሁን ቆልፍ")}</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}

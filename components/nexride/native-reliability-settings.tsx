"use client";
import { useEffect, useState } from "react";
import { enableNexRideNativeNotifications } from "../../lib/nexride-native-reliability";

export function NativeReliabilitySettings({ role }: { role: "rider" | "driver" }) {
  const [native, setNative] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    void import("@capacitor/core").then(({ Capacitor }) => {
      if (mounted) setNative(Capacitor.isNativePlatform());
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  if (!native) return null;
  const enable = async () => {
    setBusy(true); setMessage("");
    try {
      const status = await enableNexRideNativeNotifications(role);
      setMessage(status === "registration_started"
        ? "Android notifications enabled. Device registration will complete when Firebase is configured."
        : status === "denied" ? "Notifications are disabled. Enable them in Android app settings."
        : "This feature requires the installed Android app.");
    } catch { setMessage("Unable to register notifications. Check network access and Android notification settings."); }
    finally { setBusy(false); }
  };
  return <section className="nr-permission-settings" aria-label="Native Android reliability">
    <div className="nr-settings-block">
      <div><strong>Android ride alerts</strong>
        <small>{role === "driver" ? "Receive eligible ride requests while NexRide is in the background." :
          "Receive important trip updates as Android notifications."}</small></div>
      <button type="button" disabled={busy} onClick={() => void enable()}
        style={{ padding: "11px 14px", background: "#5145e5", color: "#fff", border: 0, borderRadius: 12, minHeight: 44 }}>
        {busy ? "Enabling…" : "Enable alerts"}
      </button>
    </div>
    {message && <p role="status" className="nr-muted">{message}</p>}
  </section>;
}

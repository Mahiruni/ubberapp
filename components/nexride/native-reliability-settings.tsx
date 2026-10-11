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
    const onStatus = (event: Event) => {
      if (!mounted) return;
      const detail = (event as CustomEvent<{ status?: string; role?: string }>).detail;
      if (detail?.status === "registered" && detail.role === role) {
        setMessage("Your NexRide Android device is registered for push alerts.");
      } else if (detail?.status === "registration_failed") {
        setMessage("Device registration failed. Stay signed in and tap Enable alerts again.");
      } else if (detail?.status === "firebase_registration_failed") {
        setMessage("Firebase could not issue a device token. Check Google Play services and your connection.");
      }
    };
    window.addEventListener("nexride:native-push-status", onStatus);
    return () => {
      mounted = false;
      window.removeEventListener("nexride:native-push-status", onStatus);
    };
  }, [role]);
  if (!native) return null;
  const enable = async () => {
    setBusy(true); setMessage("");
    try {
      const status = await enableNexRideNativeNotifications(role);
      setMessage(status === "registration_started"
        ? "Android notification permission granted. Registering this device with NexRide…"
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

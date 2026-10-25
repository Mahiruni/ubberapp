"use client";
import { useEffect, useState } from "react";
import { enableNexRideNativeNotifications, nativeDriverGpsStatus, openNativeDriverSettings, type NativeDriverGpsStatus } from "../../lib/nexride-native-reliability";

export function NativeReliabilitySettings({ role }: { role: "rider" | "driver" }) {
  const [native, setNative] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState<(NativeDriverGpsStatus & { checkedAt: number }) | null>(null);
  useEffect(() => {
    if (!native || role !== "driver") return;
    let disposed = false;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void nativeDriverGpsStatus().then(status => { if (!disposed) setTracking(status ? { ...status, checkedAt: Date.now() } : null); }).catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("biloo:native-resume", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true; window.clearInterval(timer);
      window.removeEventListener("biloo:native-resume", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [native, role]);
  useEffect(() => {
    let mounted = true;
    void import("@capacitor/core").then(({ Capacitor }) => {
      if (mounted) setNative(Capacitor.isNativePlatform());
    }).catch(() => {});
    const onStatus = (event: Event) => {
      if (!mounted) return;
      const detail = (event as CustomEvent<{ status?: string; role?: string }>).detail;
      if (detail?.status === "registered" && detail.role === role) {
        setMessage("Your Biloo Android device is registered for push alerts.");
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
        ? "Android notification permission granted. Registering this device with Biloo…"
        : status === "denied" ? "Notifications are disabled. Enable them in Android app settings."
        : "This feature requires the installed Android app.");
    } catch { setMessage("Unable to register notifications. Check network access and Android notification settings."); }
    finally { setBusy(false); }
  };
  return <section className="nr-permission-settings" aria-label="Native Android reliability">
    {role === "driver" && <div className="nr-settings-block">
      <div><strong>GPS with the screen locked</strong>
        <small>{tracking?.locationEnabled === false ? "Turn on Android Location to share your position."
          : tracking && !tracking.state ? "Install the updated Biloo Driver APK to enable this feature."
          : tracking?.running && tracking.state === "ready" && tracking.checkedAt >= (tracking.lastUploadAt ?? 0) && tracking.checkedAt - (tracking.lastUploadAt ?? 0) < 60000 ? "Native location sharing is active while you are Online."
          : tracking?.running ? "Waiting for a fresh GPS fix or connection."
          : "Go Online with Biloo Driver open to start location sharing."}</small>
        {tracking?.batteryExempt === false && <small>Allow background battery use in Android app settings for longer locked-screen sessions.</small>}
      </div>
      <button type="button" onClick={() => void openNativeDriverSettings().catch(() => setMessage("Open Android Settings → Apps → Biloo Driver → Battery and allow background use."))}
        style={{ padding: "11px 14px", background: "var(--nr-surface, #f1f5f4)", color: "var(--nr-text, #173329)", border: "1px solid var(--nr-border, #d5e0dc)", borderRadius: 12, minHeight: 44 }}>
        Android settings
      </button>
    </div>}
    <div className="nr-settings-block">
      <div><strong>Android ride alerts</strong>
        <small>{role === "driver" ? "Receive eligible ride requests while Biloo is in the background." :
          "Receive important trip updates as Android notifications."}</small></div>
      <button type="button" disabled={busy} onClick={() => void enable()}
        style={{ padding: "11px 14px", background: "#5145e5", color: "#fff", border: 0, borderRadius: 12, minHeight: 44 }}>
        {busy ? "Enabling…" : "Enable alerts"}
      </button>
    </div>
    {message && <p role="status" className="nr-muted">{message}</p>}
  </section>;
}

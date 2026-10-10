"use client";

import { useContext, useEffect, useState } from "react";
import { Icon, LanguageContext } from "./ui";
import type { LocationStatus, RiderLocation } from "../../lib/nexride-location";
import { driverGpsQuality } from "../../lib/nexride-driver-radar";
import "./driver-live-radar.css";

type SyncState = { status: "synced" | "error"; at: number } | null;

export function DriverLiveRadar({
  online, position, status, enabled, onToggle, onLocate,
}: {
  online: boolean;
  position: RiderLocation | null;
  status: LocationStatus;
  enabled: boolean;
  onToggle: () => void;
  onLocate: () => void;
}) {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === "am" ? am : en;
  const [clock, setClock] = useState(() => Date.now());
  const [connected, setConnected] = useState(true);
  const [sync, setSync] = useState<SyncState>(null);

  useEffect(() => {
    const update = () => { setClock(Date.now()); setConnected(navigator.onLine); };
    update();
    const timer = window.setInterval(update, 5000);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    const onSync = (event: Event) => {
      const detail = (event as CustomEvent<{ status: "synced" | "error"; at: number }>).detail;
      if (detail?.status === "synced" || detail?.status === "error") {
        setSync({ status: detail.status, at: detail.at });
      }
    };
    window.addEventListener("nexride:driver-gps-sync", onSync);
    return () => window.removeEventListener("nexride:driver-gps-sync", onSync);
  }, []);

  const quality = driverGpsQuality(position, status, clock);
  const active = online && connected && enabled && quality === "live";
  const accuracy = quality === "live" && position
    ? Math.round(position.accuracy)
    : null;
  const syncFresh = online && sync?.status === "synced" && clock - sync.at < 35_000;
  const headline = !online
    ? say("Radar paused · Offline", "ራዳር ቆሟል · ከመስመር ውጭ")
    : !connected
      ? say("No network", "ኢንተርኔት የለም")
      : quality === "live"
        ? say("Live GPS fix", "ቀጥታ GPS አካባቢ")
        : quality === "denied"
          ? say("Location blocked", "የአካባቢ ፈቃድ ታግዷል")
          : quality === "stale"
            ? say("GPS signal stale", "የGPS ምልክት ዘግይቷል")
            : say("Acquiring GPS", "GPS በመፈለግ ላይ");

  return (
    <aside
      className="nr-driver-radar-panel"
      data-active={active ? "true" : "false"}
      data-quality={quality}
      data-map-input-boundary="true"
      aria-label={say("Driver GPS and request radar", "የአሽከርካሪ GPS እና የጉዞ ራዳር")}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="nr-driver-radar-head">
        <span className="nr-driver-radar-visual" aria-hidden="true"><i/><i/><i/></span>
        <div className="nr-driver-radar-labels">
          <strong>{say("Live radar", "ቀጥታ ራዳር")}</strong>
          <span role="status">{headline}</span>
        </div>
        <button
          type="button"
          className="nr-driver-radar-toggle"
          onClick={onToggle}
          aria-pressed={enabled}
          aria-label={say(enabled ? "Hide GPS range rings" : "Show GPS range rings", enabled ? "የGPS ራዳርን ደብቅ" : "የGPS ራዳርን አሳይ")}
        >{enabled ? say("On", "በርቷል") : say("Off", "ጠፍቷል")}</button>
      </div>
      <div className="nr-driver-radar-metrics">
        <span><Icon name="locate" size={14} />{accuracy === null ? say("GPS unavailable", "GPS አይገኝም") : `±${accuracy} m`}</span>
        <span><Icon name="navigation" size={14} />{position && quality === "live" && position.heading !== null ? `${Math.round(position.heading)}°` : "—"}</span>
        <span data-synced={syncFresh ? "true" : "false"}>
          <Icon name={syncFresh ? "check" : "refresh"} size={14} />
          {!online ? say("Not sharing", "አይጋራም") : syncFresh ? say("GPS sent", "GPS ተልኳል") : sync?.status === "error" ? say("Sync retrying", "እንደገና በመላክ ላይ") : say("Sync pending", "በመላክ ላይ")}
        </span>
      </div>
      <div className="nr-driver-radar-foot">
        <small>{active
          ? say("1 km GPS area · Waiting for verified offers", "1 ኪሜ GPS አካባቢ · ጥያቄን በመጠበቅ ላይ")
          : say("Rings show coverage, not unassigned Riders", "ይህ ራዳር ያልተመደቡ ተሳፋሪዎችን አያሳይም")}
        </small>
        <button type="button" onClick={onLocate} aria-label={say("Refresh and recenter GPS", "GPS አድስ እና ወደ አካባቢዬ መልስ")}><Icon name="locate" size={16}/>{say("Locate", "አካባቢ")}</button>
      </div>
    </aside>
  );
}

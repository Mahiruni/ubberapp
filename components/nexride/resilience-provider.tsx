"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type NetworkState = "online" | "slow" | "reconnecting" | "offline" | "restored";

const DATA_SAVER_KEY = "nexride.data-saver";
const NETWORK_EVENT = "nexride:network-state";

function connectionSnapshot() {
  if (typeof navigator === "undefined") return { slow: false, saveData: false };
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  }).connection;
  const effective = connection?.effectiveType || "";
  const downlink = Number(connection?.downlink);
  const slow =
    effective === "slow-2g" ||
    effective === "2g" ||
    (Number.isFinite(downlink) && downlink > 0 && downlink < 0.9);
  return { slow, saveData: Boolean(connection?.saveData) };
}

export function NexRideResilienceProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<NetworkState>("online");
  const [dataSaver, setDataSaver] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  const offlineSince = useRef<number | null>(null);
  const restoreTimer = useRef<number | null>(null);
  const probeTimer = useRef<number | null>(null);
  const consecutiveFailures = useRef(0);

  const applyDataSaver = useCallback((enabled: boolean) => {
    setDataSaver(enabled);
    document.documentElement.toggleAttribute("data-nr-data-saver", enabled);
    document.body?.toggleAttribute("data-nr-data-saver", enabled);
    try {
      localStorage.setItem(DATA_SAVER_KEY, enabled ? "1" : "0");
    } catch {}
  }, []);

  const publish = useCallback((next: NetworkState) => {
    setNetwork(next);
    document.documentElement.dataset.nrNetwork = next;
    window.dispatchEvent(new CustomEvent(NETWORK_EVENT, { detail: { state: next } }));
  }, []);

  useEffect(() => {
    const snapshot = connectionSnapshot();
    let persisted = false;
    try {
      persisted = localStorage.getItem(DATA_SAVER_KEY) === "1";
    } catch {}
    applyDataSaver(persisted || snapshot.saveData);

    const evaluate = () => {
      if (!navigator.onLine) {
        offlineSince.current ??= Date.now();
        publish("offline");
        return;
      }
      const current = connectionSnapshot();
      publish(current.slow ? "slow" : "online");
    };

    const restored = () => {
      consecutiveFailures.current = 0;
      if (offlineSince.current) {
        offlineSince.current = null;
        publish("restored");
        setShowRestored(true);
        if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
        restoreTimer.current = window.setTimeout(() => {
          setShowRestored(false);
          evaluate();
        }, 3200);
      } else {
        evaluate();
      }
    };

    const wentOffline = () => {
      offlineSince.current ??= Date.now();
      publish("offline");
    };

    const connection = (navigator as Navigator & {
      connection?: EventTarget;
    }).connection;

    window.addEventListener("online", restored);
    window.addEventListener("offline", wentOffline);
    connection?.addEventListener?.("change", evaluate);
    evaluate();

    return () => {
      window.removeEventListener("online", restored);
      window.removeEventListener("offline", wentOffline);
      connection?.removeEventListener?.("change", evaluate);
      if (restoreTimer.current) window.clearTimeout(restoreTimer.current);
      if (probeTimer.current) window.clearTimeout(probeTimer.current);
    };
  }, [applyDataSaver, publish]);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      if (cancelled || !navigator.onLine) return;
      const started = performance.now();
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch("/manifest.webmanifest", {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        const elapsed = performance.now() - started;
        if (!response.ok) throw new Error("probe");
        consecutiveFailures.current = 0;
        if (network === "reconnecting") publish(elapsed > 2200 ? "slow" : "online");
      } catch {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= 2 && navigator.onLine) publish("reconnecting");
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) {
          const delay = Math.min(60_000, 12_000 * 2 ** Math.min(consecutiveFailures.current, 3));
          probeTimer.current = window.setTimeout(probe, delay);
        }
      }
    };

    probeTimer.current = window.setTimeout(probe, 2500);
    return () => {
      cancelled = true;
      if (probeTimer.current) window.clearTimeout(probeTimer.current);
    };
  }, [network, publish]);

  const message = useMemo(() => {
    if (network === "offline") return "You’re offline. Showing the latest saved trip information.";
    if (network === "reconnecting") return "Reconnecting… live trip updates may be delayed.";
    if (network === "slow") return "Connection is slow. NexRide is reducing background data.";
    if (network === "restored" || showRestored) return "Back online. Live trip updates restored.";
    if (dataSaver) return "Data Saver is on.";
    return "";
  }, [network, showRestored, dataSaver]);

  const visible = network !== "online" || dataSaver || showRestored;

  return (
    <>
      {children}
      <div className="nr-network-live" aria-live="polite" aria-atomic="true">
        {message}
      </div>
      {visible && (
        <aside className="nr-network-banner" data-state={network} role="status">
          <span className="nr-network-dot" aria-hidden="true" />
          <span className="nr-network-copy">{message}</span>
          <button
            type="button"
            className="nr-data-saver-toggle"
            aria-pressed={dataSaver}
            onClick={() => applyDataSaver(!dataSaver)}
          >
            {dataSaver ? "Data Saver on" : "Data Saver"}
          </button>
        </aside>
      )}
    </>
  );
}

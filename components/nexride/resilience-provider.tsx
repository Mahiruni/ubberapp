"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NetworkState = "online" | "slow" | "reconnecting" | "offline";

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
  const offlineSince = useRef<number | null>(null);
  const probeTimer = useRef<number | null>(null);
  const networkRef = useRef<NetworkState>("online");
  const consecutiveFailures = useRef(0);

  const applyDataSaver = useCallback((enabled: boolean) => {
    setDataSaver(enabled);
    document.documentElement.toggleAttribute("data-nr-data-saver", enabled);
    document.body?.toggleAttribute("data-nr-data-saver", enabled);
    try {
      localStorage.setItem(DATA_SAVER_KEY, enabled ? "1" : "0");
    } catch {}
  }, []);

  const publish = useCallback(
    (next: NetworkState, _overrideMessage?: string) => {
      const previous = networkRef.current;
      if (previous === next) return;

      networkRef.current = next;
      setNetwork(next);
      // Connectivity remains an internal resilience signal only. Do not surface
      // connection strength, offline/online, or reconnecting status in the UI.
      document.documentElement.dataset.nrNetwork = next;
      window.dispatchEvent(
        new CustomEvent(NETWORK_EVENT, { detail: { state: next } }),
      );
    },
    [],
  );

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
      const hadBeenOffline = offlineSince.current !== null;
      offlineSince.current = null;
      const current = connectionSnapshot();
      publish(
        current.slow ? "slow" : "online",
        hadBeenOffline ? "Back online. Live trip updates restored." : undefined,
      );
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

  return <>{children}</>;
}

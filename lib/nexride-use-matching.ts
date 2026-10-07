"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { matchingAdapter, newerMatch, type MatchRequest, type MatchSnapshot, type MatchStatus } from "./nexride-matching";
import { supabase } from "./supabase";

const previewSnapshot = (id: string, status: MatchStatus, version: number): MatchSnapshot => ({
  requestId: id,
  version,
  status,
  cancellation: {
    allowed: status === "searching" || status === "delayed" || status === "assigned",
    requiresConfirmation: false,
    fee: 0,
    reason: null,
  },
  canRetry: status === "no_drivers",
  canChangeCategory: status === "no_drivers" || status === "cancelled",
});

export function useMatching() {
  const [request, setRequest] = useState<MatchRequest | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const requestRef = useRef(request);
  const snapshotRef = useRef(snapshot);
  const lock = useRef(false);
  const actionController = useRef<AbortController | null>(null);

  requestRef.current = request;
  snapshotRef.current = snapshot;

  const start = useCallback((value: MatchRequest) => {
    actionController.current?.abort();
    requestRef.current = value;
    const initial =
      value.source === "preview"
        ? previewSnapshot(value.requestId, "searching", 0)
        : null;
    snapshotRef.current = initial;
    setRequest(value);
    setSnapshot(initial);
    setConnectionLost(false);
    setSyncFailed(false);
    setReconnecting(false);
    setActionFailed(false);
  }, []);

  const merge = useCallback((next: MatchSnapshot) => {
    if (next.requestId !== requestRef.current?.requestId) return;
    setSnapshot((current) => {
      const updated = newerMatch(current, next);
      snapshotRef.current = updated;
      return updated;
    });
  }, []);

  const terminal =
    snapshot?.status === "cancelled" || snapshot?.status === "no_drivers";

  useEffect(() => {
    if (!request || request.source === "preview" || terminal) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let generation = 0;

    const schedule = () => {
      if (!active) return;
      clearTimeout(timer);
      timer = setTimeout(read, 5000);
    };

    const read = async () => {
      if (!active || lock.current) return;

      if (!navigator.onLine) {
        setConnectionLost(true);
        setSyncFailed(false);
        setReconnecting(false);
        schedule();
        return;
      }

      controller?.abort();
      const localController = new AbortController();
      controller = localController;
      const readGeneration = ++generation;

      try {
        const value = await matchingAdapter.read(
          request.requestId,
          AbortSignal.any([
            localController.signal,
            AbortSignal.timeout(10000),
          ]),
        );

        if (active && readGeneration === generation) {
          merge(value);
          setConnectionLost(false);
          setSyncFailed(false);
          setReconnecting(false);
          setActionFailed(false);
        }
      } catch {
        if (
          active &&
          readGeneration === generation &&
          !localController.signal.aborted
        ) {
          const offline = !navigator.onLine;
          setConnectionLost(offline);
          setSyncFailed(!offline);
          setReconnecting(false);
        }
      } finally {
        if (active && readGeneration === generation) schedule();
      }
    };

    const reconnect = () => {
      clearTimeout(timer);
      setReconnecting(true);
      setConnectionLost(false);
      setSyncFailed(false);
      void read();
    };

    const offline = () => {
      controller?.abort();
      setConnectionLost(true);
      setSyncFailed(false);
      setReconnecting(false);
    };

    const visible = () => {
      if (document.visibilityState === "visible") reconnect();
    };

    void read();
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);

    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [request, terminal, refresh, merge]);

  useEffect(() => {
    if (!request || request.source === "preview" || terminal) return;
    const channel = supabase
      .channel("rider-match-live:" + request.requestId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ride_requests",
          filter: "id=eq." + request.requestId,
        },
        () => setRefresh((n) => n + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [request, terminal]);

  useEffect(() => () => actionController.current?.abort(), []);

  const action = async (
    kind: "cancel" | "retry",
    expectedVersion?: number,
  ) => {
    const current = snapshotRef.current;
    const selected = requestRef.current;

    if (
      !current ||
      !selected ||
      lock.current ||
      (expectedVersion !== undefined &&
        current.version !== expectedVersion) ||
      (kind === "cancel"
        ? !current.cancellation.allowed
        : !current.canRetry)
    )
      return;

    if (selected.source === "preview") {
      const next = previewSnapshot(
        selected.requestId,
        kind === "cancel" ? "cancelled" : "searching",
        current.version + 1,
      );
      snapshotRef.current = next;
      setSnapshot(next);
      setConnectionLost(false);
      setSyncFailed(false);
      setActionFailed(false);
      return;
    }

    lock.current = true;
    setBusy(true);
    setActionFailed(false);
    const controller = new AbortController();
    actionController.current = controller;

    try {
      const value = await matchingAdapter.action(
        current,
        kind,
        AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      );

      if (requestRef.current?.requestId === selected.requestId) {
        merge(value);
        setConnectionLost(false);
        setSyncFailed(false);
        if (
          value.status !==
          (kind === "cancel" ? "cancelled" : "searching")
        )
          setActionFailed(true);
      }
    } catch {
      if (!controller.signal.aborted) {
        const offline = !navigator.onLine;
        setActionFailed(true);
        setConnectionLost(offline);
        setSyncFailed(!offline);
      }
    } finally {
      lock.current = false;
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  };

  const previewState = (
    status: Exclude<MatchStatus, "assigned"> | "connection_lost",
  ) => {
    if (request?.source !== "preview") return;
    if (status === "connection_lost") {
      setConnectionLost(true);
      setSyncFailed(false);
      return;
    }
    setConnectionLost(false);
    setSyncFailed(false);
    setSnapshot(
      previewSnapshot(
        request.requestId,
        status,
        (snapshot?.version || 0) + 1,
      ),
    );
  };

  const clear = () => {
    if (busy) return;
    setRequest(null);
    setSnapshot(null);
    setConnectionLost(false);
    setSyncFailed(false);
    setReconnecting(false);
    setActionFailed(false);
  };

  const reconnect = () => {
    if (request?.source === "preview") {
      setConnectionLost(false);
      setSyncFailed(false);
      setReconnecting(false);
      return;
    }
    setActionFailed(false);
    setSyncFailed(false);
    setReconnecting(true);
    if (navigator.onLine) setConnectionLost(false);
    setRefresh((n) => n + 1);
  };

  return {
    request,
    snapshot,
    connectionLost,
    syncFailed,
    reconnecting,
    busy,
    actionFailed,
    start,
    action,
    previewState,
    clear,
    reconnect,
    active:
      !!request &&
      (!snapshot ||
        !["cancelled", "no_drivers"].includes(snapshot.status)),
  };
}

export type Matching = ReturnType<typeof useMatching>;

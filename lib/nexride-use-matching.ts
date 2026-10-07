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
  const reconnectController = useRef<AbortController | null>(null);
  const connectionLostRef = useRef(connectionLost);
  const syncFailedRef = useRef(syncFailed);

  requestRef.current = request;
  snapshotRef.current = snapshot;
  connectionLostRef.current = connectionLost;
  syncFailedRef.current = syncFailed;

  const start = useCallback((value: MatchRequest) => {
    actionController.current?.abort();
    reconnectController.current?.abort();
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
    setBusy(false);
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
          const offline =
            typeof navigator !== "undefined" && navigator.onLine === false;
          setConnectionLost(offline);
          setSyncFailed(!offline);
          setReconnecting(false);
        }
      } finally {
        if (active && readGeneration === generation) schedule();
      }
    };

    const resume = () => {
      clearTimeout(timer);
      setReconnecting(true);
      setConnectionLost(false);
      setSyncFailed(false);
      void read();
    };

    const offline = () => {
      setConnectionLost(true);
      setSyncFailed(false);
      setReconnecting(false);
    };

    const visible = () => {
      if (document.visibilityState === "visible") resume();
    };

    void read();
    window.addEventListener("online", resume);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);

    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener("online", resume);
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

  useEffect(
    () => () => {
      actionController.current?.abort();
      reconnectController.current?.abort();
    },
    [],
  );

  const action = async (
    kind: "cancel" | "retry",
    expectedVersion?: number,
  ): Promise<MatchSnapshot | null> => {
    const selected = requestRef.current;
    if (!selected || lock.current) return null;

    let current = snapshotRef.current;

    if (selected.source === "preview") {
      if (
        !current ||
        (expectedVersion !== undefined && current.version !== expectedVersion) ||
        (kind === "cancel"
          ? !current.cancellation.allowed
          : !current.canRetry)
      )
        return null;

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
      return next;
    }

    lock.current = true;
    setBusy(true);
    setActionFailed(false);
    const controller = new AbortController();
    actionController.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(15000),
    ]);

    try {
      if (
        !current ||
        connectionLostRef.current ||
        syncFailedRef.current
      ) {
        current = await matchingAdapter.read(selected.requestId, signal);
        if (requestRef.current?.requestId !== selected.requestId) return null;
        merge(current);
        setConnectionLost(false);
        setSyncFailed(false);
        setReconnecting(false);
      }

      if (
        expectedVersion !== undefined &&
        current.version !== expectedVersion
      ) {
        setActionFailed(true);
        return current;
      }

      const allowed =
        kind === "cancel"
          ? current.cancellation.allowed
          : current.canRetry;

      if (!allowed) {
        merge(current);
        if (kind === "cancel" && current.status === "cancelled")
          return current;
        setActionFailed(true);
        return current;
      }

      const value = await matchingAdapter.action(
        current,
        kind,
        signal,
      );

      if (requestRef.current?.requestId === selected.requestId) {
        merge(value);
        setConnectionLost(false);
        setSyncFailed(false);
        setReconnecting(false);
        if (
          value.status !==
          (kind === "cancel" ? "cancelled" : "searching")
        )
          setActionFailed(true);
      }
      return value;
    } catch {
      if (!controller.signal.aborted) {
        const offline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        setActionFailed(true);
        setConnectionLost(offline);
        setSyncFailed(!offline);
        setReconnecting(false);
      }
      return null;
    } finally {
      if (actionController.current === controller)
        actionController.current = null;
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
    actionController.current?.abort();
    reconnectController.current?.abort();
    requestRef.current = null;
    snapshotRef.current = null;
    setRequest(null);
    setSnapshot(null);
    setConnectionLost(false);
    setSyncFailed(false);
    setReconnecting(false);
    setActionFailed(false);
  };

  const reconnect = async (): Promise<MatchSnapshot | null> => {
    const selected = requestRef.current;
    if (!selected || lock.current) return null;

    if (selected.source === "preview") {
      setConnectionLost(false);
      setSyncFailed(false);
      setReconnecting(false);
      setActionFailed(false);
      return snapshotRef.current;
    }

    reconnectController.current?.abort();
    const controller = new AbortController();
    reconnectController.current = controller;
    setActionFailed(false);
    setSyncFailed(false);
    setReconnecting(true);

    try {
      const value = await matchingAdapter.read(
        selected.requestId,
        AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(12000),
        ]),
      );
      if (requestRef.current?.requestId !== selected.requestId) return null;
      merge(value);
      setConnectionLost(false);
      setSyncFailed(false);
      setActionFailed(false);
      return value;
    } catch {
      if (!controller.signal.aborted) {
        const offline =
          typeof navigator !== "undefined" && navigator.onLine === false;
        setConnectionLost(offline);
        setSyncFailed(!offline);
      }
      return null;
    } finally {
      if (reconnectController.current === controller)
        reconnectController.current = null;
      setReconnecting(false);
      setRefresh((n) => n + 1);
    }
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

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

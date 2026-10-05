'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchingAdapter, newerMatch, type MatchRequest, type MatchSnapshot, type MatchStatus } from './nexride-matching';
const previewSnapshot = (id: string, status: MatchStatus, version: number): MatchSnapshot => ({
  requestId: id, version, status,
  cancellation: { allowed: status === 'searching' || status === 'delayed' || status === 'assigned', requiresConfirmation: false, fee: 0, reason: null },
  canRetry: status === 'no_drivers', canChangeCategory: status === 'no_drivers' || status === 'cancelled',
});
export function useMatching() {
  const [request, setRequest] = useState<MatchRequest | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const requestRef = useRef(request), snapshotRef = useRef(snapshot), lock = useRef(false);
  const actionController = useRef<AbortController | null>(null);
  requestRef.current = request; snapshotRef.current = snapshot;
  const start = useCallback((value: MatchRequest) => {
    actionController.current?.abort();
    requestRef.current = value;
    const initial = value.source === 'preview' ? previewSnapshot(value.requestId, 'searching', 0) : null;
    snapshotRef.current = initial;
    setRequest(value); setSnapshot(initial); setConnectionLost(false); setActionFailed(false);
  }, []);
  const merge = useCallback((next: MatchSnapshot) => {
    if (next.requestId !== requestRef.current?.requestId) return;
    setSnapshot(current => {
      const updated = newerMatch(current, next);
      snapshotRef.current = updated;
      return updated;
    });
  }, []);
  const terminal = snapshot?.status === 'cancelled' || snapshot?.status === 'no_drivers';
  useEffect(() => {
    if (!request || request.source === 'preview' || terminal) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let generation = 0;
    const read = async () => {
      if (!active || lock.current) return;
      controller?.abort(); const localController = new AbortController(); controller = localController;
      const readGeneration = ++generation;
      try {
        if (!navigator.onLine) throw new Error('offline');
        const value = await matchingAdapter.read(request.requestId, AbortSignal.any([localController.signal, AbortSignal.timeout(10000)]));
        if (active && readGeneration === generation) { merge(value); setConnectionLost(false); if (value.status === "cancelled") setActionFailed(false); }
      } catch {
        if (active && readGeneration === generation && !localController.signal.aborted) setConnectionLost(true);
      } finally {
        if (active && readGeneration === generation) { clearTimeout(timer); timer = setTimeout(read, 5000); }
      }
    };
    const reconnect = () => { clearTimeout(timer); void read(); };
    const offline = () => { controller?.abort(); setConnectionLost(true); };
    const visible = () => { if (document.visibilityState === 'visible') reconnect(); };
    void read();
    window.addEventListener('online', reconnect); window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearTimeout(timer); controller?.abort(); window.removeEventListener('online', reconnect); window.removeEventListener('offline', offline); document.removeEventListener('visibilitychange', visible); };
  }, [request, terminal, refresh, merge]);
  useEffect(() => () => actionController.current?.abort(), []);
  const action = async (kind: 'cancel' | 'retry', expectedVersion?: number) => {
    const current = snapshotRef.current, selected = requestRef.current;
    if (!current || !selected || lock.current || (expectedVersion !== undefined && current.version !== expectedVersion) ||
      (kind === 'cancel' ? !current.cancellation.allowed : !current.canRetry)) return;
    if (selected.source === 'preview') {
      setSnapshot(previewSnapshot(selected.requestId, kind === 'cancel' ? 'cancelled' : 'searching', current.version + 1));
      setConnectionLost(false); setActionFailed(false); return;
    }
    lock.current = true; setBusy(true); setActionFailed(false);
    const controller = new AbortController(); actionController.current = controller;
    try {
      const value = await matchingAdapter.action(current, kind, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (requestRef.current?.requestId === selected.requestId) {
        merge(value); setConnectionLost(false);
        if (value.status !== (kind === 'cancel' ? 'cancelled' : 'searching')) setActionFailed(true);
      }
    } catch { if (!controller.signal.aborted) { setActionFailed(true); setConnectionLost(true); } }
    finally { lock.current = false; setBusy(false); setRefresh(n => n + 1); }
  };
  const previewState = (status: Exclude<MatchStatus, 'assigned'> | 'connection_lost') => {
    if (request?.source !== 'preview') return;
    if (status === 'connection_lost') { setConnectionLost(true); return; }
    setConnectionLost(false);
    setSnapshot(previewSnapshot(request.requestId, status, (snapshot?.version || 0) + 1));
  };
  const clear = () => { if (!busy) { setRequest(null); setSnapshot(null); setConnectionLost(false); } };
  return { request, snapshot, connectionLost, busy, actionFailed, start, action, previewState, clear,
    reconnect: () => { if (request?.source === 'preview') setConnectionLost(false); else setRefresh(n => n + 1); },
    active: !!request && (!snapshot || !['cancelled', 'no_drivers'].includes(snapshot.status)),
  };
}
export type Matching = ReturnType<typeof useMatching>;

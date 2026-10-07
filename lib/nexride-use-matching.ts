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
    const initial = value.source === "preview" ? previewSnapshot(value.requestId, "searching", 0) : null;
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
      co...[truncated]
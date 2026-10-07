'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, LanguageContext, useTranslation } from './ui';
import { endpointName } from './destination';
import { RiderSheetHandle } from './rider-sheet';
import { fareTotal } from '../../lib/nexride-booking';
import type { Matching } from '../../lib/nexride-use-matching';
export function DriverMatching({ model, changeCategory, previewAssigned, home }: {
  model: Matching; changeCategory: () => void; previewAssigned: () => void; home: () => void;
}) {
  const t = useTranslation(), language = useContext(LanguageContext);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { request, snapshot, connectionLost, syncFailed, reconnecting, busy, actionFailed } = model;
  const status = snapshot?.status || 'searching';
  const degraded = !connectionLost && syncFailed;
  const title = connectionLost ? 'matchingConnection' : degraded ? 'matchingSyncProblem' : status === 'assigned' ? 'assigned' : status === 'delayed' ? 'matchingDelayed' : status === 'no_drivers' ? 'matchingEmpty' : status === 'cancelled' ? 'matchingCancelled' : 'finding';
  useEffect(() => { if (status === 'assigned') heading.current?.focus(); }, [status]);
  // Close stale terms if dispatch changes while a confirmation is open.
  useEffect(() => { setConfirmVersion(null); }, [snapshot?.version]);
  if (!request) return null;
  const preview = request.source === 'preview';
  const searching = !connectionLost && !degraded && (status === 'searching' || status === 'delayed');
  const terms = snapshot?.cancellation;
  const total = fareTotal(request.fare);
  const money = (n: number) => new Intl.NumberFormat(language === 'am' ? 'am-ET' : 'en-ET', { maximumFractionDigits: 2 }).format(n);
  const cancel = () => {
    if (!snapshot || !terms?.allowed || busy) return;
    if (terms.requiresConfirmation || (terms.fee !== null && terms.fee ...[truncated]
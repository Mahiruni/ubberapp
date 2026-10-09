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
  const [cancelSuccess, setCancelSuccess] = useState(false);
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
  const completeCancel = async (version?: number) => {
    const next = await model.action('cancel', version);
    if (next?.status === 'cancelled') setCancelSuccess(true);
  };
  const cancel = () => {
    if (busy || reconnecting || terms?.allowed === false) return;
    // All cancellations require a Yes/No decision, even before the first
    // server snapshot arrives. The action handler fetches the current version.
    setConfirmVersion(snapshot?.version ?? -1);
  };
  return <section className="nr-driver-matching" data-matching-state={connectionLost ? 'connection_lost' : degraded ? 'sync_problem' : status} aria-label={t('matchingScreen')}>
    <RiderSheetHandle
      label={language === "am" ? "የአሽከርካሪ ማዛመጃ ፓነሉን አስፋ ወይም አሳንስ" : "Resize driver matching panel"}
      defaultRatio={0.54}
      snaps={[0.28, 0.54, 0.75]}
      scrollSelector=".nr-matching-body"
      storageKey="nexride.rider.sheet.matching"
    />
    <div className="nr-matching-body">
      <div className={`nr-matching-symbol ${searching ? 'searching' : ''}`} aria-hidden="true"><Icon name={status === 'assigned' || status === 'cancelled' ? 'check' : connectionLost || degraded ? 'globe' : 'locate'} size={28} /></div>
      <header className="nr-matching-heading">
        <span className="nr-matching-kicker">
          {language === "am"
            ? status === "assigned"
              ? "አሽከርካሪ ተገኝቷል"
              : "NEXRIDE እየፈለገ ነው"
            : status === "assigned"
              ? "DRIVER MATCHED"
              : "NEXRIDE MATCHING"}
        </span>
        <h1 tabIndex={-1} ref={heading}>{t(title)}</h1>
        <p>{t(connectionLost ? 'matchingConnectionNote' : degraded ? 'matchingSyncProblemNote' : status === 'assigned' ? 'matchingAcceptedNote' : status === 'no_drivers' ? 'matchingEmptyNote' : status === 'cancelled' ? 'matchingCancelledNote' : status === 'delayed' ? 'matchingDelayedNote' : 'matchingNote')}</p>
      </header>
      {!preview && searching && <p className="nr-match-waiting-note" role="status">
        <Icon name="clock" size={16} />
        {language === "am"
          ? "አሁን አሽከርካሪ ካልተገኘ አዲስ አሽከርካሪ መስመር ላይ ሲገባ ጥያቄዎ በራስ-ሰር ይላካል። ለመገናኘት የአሽከርካሪው ፈቃድ ያስፈልጋል።"
          : "No Driver Online yet? We’ll automatically send your request when an eligible Driver becomes available. Your Driver must accept to confirm the ride."}
      </p>}
      <span className="nr-sr-only" role="status" aria-live="polite" aria-atomic="true">{t(title)}</span>
      {searching && <div className="nr-match-progress" aria-label={t('matchingProgress')}>
        <span><Icon name="check" size={16} />{t('matchingRequestSent')}</span><span className="nr-match-progress-line" />
        <span><i className="nr-match-dots" aria-hidden="true"><b/><b/><b/></i>{t('matchingAcceptance')}</span>
      </div>}
      {status === 'assigned' && snapshot?.driver && <div className="nr-confirmed-driver nr-confirmed-driver-v2">
        <span className="nr-confirmed-driver-avatar"><Icon name="user" size={28}/></span>
        <div className="nr-confirmed-driver-copy">
          <small>{language === "am" ? "የእርስዎ አሽከርካሪ" : "YOUR DRIVER"}</small>
          <strong>{snapshot.driver.name}</strong>
          <p>{snapshot.driver.vehicle}</p>
          <span className="nr-confirmed-plate">{snapshot.driver.plate}</span>
        </div>
        {snapshot.driver.pickupMinutes !== null && <div className="nr-confirmed-driver-eta"><small>{t('estimated')}</small><strong>{money(snapshot.driver.pickupMinutes)} {t('minutes')}</strong></div>}
      </div>}
      <div className="nr-match-summary" aria-label={t('matchingSummary')}>
        <div className="nr-match-place"><span className="nr-match-point"/><div><small>{t('pickup')}</small><strong>{request.journey.pickup && endpointName(request.journey.pickup, language, t)}</strong></div></div>
        <div className="nr-match-place"><span className="nr-match-point destination"/><div><small>{t('dropoff')}</small><strong>{request.journey.destination && endpointName(request.journey.destination, language, t)}</strong></div></div>
        {request.journey.routeState.status === 'ready' && request.journey.routeState.route && <div className="nr-match-route-meta" data-traffic={request.journey.routeState.route.traffic?.level || 'unavailable'}>
          <span><Icon name="clock" size={15}/>{Math.max(1, Math.round(request.journey.routeState.route.durationSeconds / 60))} {t('minutes')}</span>
          <span>{(request.journey.routeState.route.distanceMeters / 1000).toFixed(1)} {t('kilometers')}</span>
          <span className="nr-match-traffic"><i aria-hidden="true"/>{request.journey.routeState.route.traffic ? t(request.journey.routeState.route.traffic.level === 'low' ? 'trafficLow' : request.journey.routeState.route.traffic.level === 'moderate' ? 'trafficModerate' : request.journey.routeState.route.traffic.level === 'heavy' ? 'trafficHeavy' : 'trafficSevere') : t('trafficUnavailable')}</span>
        </div>}
        <div className="nr-match-fare"><div><strong>{t(request.fare.category)}</strong><small>{t('cash')}</small></div><div><strong>{total !== null ? money(total) : '—'} <span>ETB</span></strong><small>{t(request.fare.priceType === 'sample' ? 'sampleFare' : request.fare.priceType === 'estimate' ? 'estimated' : 'confirmed')}</small></div></div>
        {request.fare.charges.length > 0 && <details className="nr-match-charges"><summary>{t('matchingCharges')}</summary>{request.fare.charges.map((charge, i) => <p key={i}><span>{charge.name}</span><strong>{money(charge.amount)} ETB</strong></p>)}</details>}
      </div>
      {preview && <p className="nr-match-preview"><strong>{t('preview')}</strong> · {t('findingNote')}</p>}
      {actionFailed && <p className="nr-match-warning" role="alert">{t('matchingActionFailed')}</p>}
      {cancelSuccess && <div className="nr-cancel-success" role="status">
        <strong>{t('riderCancelSuccess')}</strong>
        <p>{t('riderCancelSuccessNote')}</p>
        <Button onClick={home}>{t('riderCancelHome')}</Button>
        <Button variant="secondary" onClick={changeCategory}>{t('riderCancelNewRide')}</Button>
      </div>}
      {preview && <details className="nr-match-preview-controls"><summary>{t('matchingPreviewControls')}</summary>
        <div>{(['searching', 'delayed', 'no_drivers', 'connection_lost'] as const).map(s => <button key={s} onClick={() => model.previewState(s)}>{t(s === 'searching' ? 'matchingSearchState' : s === 'delayed' ? 'matchingDelayed' : s === 'no_drivers' ? 'matchingEmpty' : 'matchingConnection')}</button>)}</div>
        <button className="nr-preview-assignment" onClick={previewAssigned}>{t('matchingPreviewAssigned')}<Icon name="arrow" size={16}/></button>
      </details>}
    </div>
    <footer>
      {(connectionLost || degraded) && <Button disabled={busy || reconnecting} loading={reconnecting} onClick={() => void model.reconnect()}>{t(reconnecting ? 'matchingReconnecting' : 'matchingReconnect')}</Button>}
      {!connectionLost && snapshot?.canRetry && <Button disabled={busy} loading={busy} onClick={() => void model.action('retry')}>{t(busy ? 'matchingUpdating' : 'matchingRetry')}</Button>}
      {['cancelled', 'no_drivers'].includes(status) && <Button variant="ghost" disabled={busy} onClick={home}>{t('home')}</Button>}
      {snapshot?.canChangeCategory && <Button variant="secondary" disabled={busy} onClick={changeCategory}>{t('matchingChangeCategory')}</Button>}
      {!cancelSuccess && !['cancelled', 'no_drivers'].includes(status) && <Button variant="danger" className="nr-rider-cancel-button" disabled={busy || reconnecting || terms?.allowed === false} onClick={cancel}><Icon name="close" size={17} />{t(busy ? 'matchingUpdating' : 'matchingCancel')}</Button>}
      {!preview && !snapshot && <small className="nr-match-terms-note">{t('matchingTermsPending')}</small>}
    </footer>
    {confirmVersion !== null && <Dialog title={t('matchingCancelConfirm')} onClose={() => setConfirmVersion(null)}>
      <p className="nr-cancel-dialog-note">{t('matchingCancelWarning')}</p>
      <div className="nr-cancel-dialog-actions">
        <Button variant="secondary" onClick={() => setConfirmVersion(null)}>{t('matchingKeep')}</Button>
        <Button variant="danger" onClick={() => { const version = confirmVersion; setConfirmVersion(null); void completeCancel(version < 0 ? undefined : version); }}>{t('matchingConfirmCancel')}</Button>
      </div>
    </Dialog>}
  </section>;
}

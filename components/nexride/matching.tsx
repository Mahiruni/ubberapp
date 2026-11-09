'use client';
import { useContext, useEffect, useRef, useState } from 'react';
import { Button, Dialog, Icon, LanguageContext, useTranslation } from './ui';
import { endpointName } from './destination';
import { RiderSheetHandle } from './rider-sheet';
import { fareTotal } from '../../lib/nexride-booking';
import type { Matching } from '../../lib/nexride-use-matching';
import { elapsedLabel } from '../../lib/biloo-journey';
import styles from './booking-interface.module.css';
import './biloo-ride-sheets.css';
import './biloo-matching-redesign.css';
export function DriverMatching({ model, changeCategory, previewAssigned, home }: {
  model: Matching; changeCategory: () => void; previewAssigned: () => void; home: () => void;
}) {
  const t = useTranslation(), language = useContext(LanguageContext);
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const { request, snapshot, connectionLost, syncFailed, reconnecting, busy, actionFailed } = model;
  const status = snapshot?.status || 'searching';
  const cancelled = status === 'cancelled' || cancelSuccess;
  const degraded = !connectionLost && syncFailed;
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const title = connectionLost ? 'matchingConnection' : degraded ? 'matchingSyncProblem' : status === 'assigned' ? 'assigned' : status === 'delayed' ? 'matchingDelayed' : status === 'no_drivers' ? 'matchingEmpty' : status === 'cancelled' ? 'matchingCancelled' : 'finding';
  const searchingState = status === 'searching' && !connectionLost && !degraded;
  const headline = searchingState ? say('Matching you with a driver', 'ከአሽከርካሪ ጋር በማገናኘት ላይ')
    : status === 'assigned' && !connectionLost && !degraded ? say('Your driver is on the way', 'አሽከርካሪዎ በመንገድ ላይ ነው')
    : t(title);
  const subtitle = searchingState ? say('Nearby drivers are being notified.', 'በአቅራቢያ ያሉ አሽከርካሪዎች እየተነገራቸው ነው።')
    : t(connectionLost ? 'matchingConnectionNote' : degraded ? 'matchingSyncProblemNote' : status === 'assigned' ? 'matchingAcceptedNote' : status === 'no_drivers' ? 'matchingEmptyNote' : status === 'cancelled' ? 'matchingCancelledNote' : status === 'delayed' ? 'matchingDelayedNote' : 'matchingNote');
  useEffect(() => { if (status === 'assigned') heading.current?.focus(); }, [status]);
  // Close stale terms if dispatch changes while a confirmation is open.
  useEffect(() => { setConfirmVersion(null); }, [snapshot?.version]);
  const searching = !connectionLost && !degraded && (status === 'searching' || status === 'delayed');
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!searching) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [searching]);
  const progress = snapshot?.progress;
  const startedAt = Date.parse(progress?.requestedAt || '');
  if (!request) return null;
  const preview = request.source === 'preview';
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
  return <section className={`nr-driver-matching ${styles.screen} ${styles.matching}`} data-matching-state={cancelled ? 'cancelled' : connectionLost ? 'connection_lost' : degraded ? 'sync_problem' : status} aria-label={t('matchingScreen')}>
    <RiderSheetHandle
      label={language === "am" ? "የአሽከርካሪ ማዛመጃ ፓነሉን አስፋ ወይም አሳንስ" : "Resize driver matching panel"}
      defaultRatio={0.56}
      desktopDefaultRatio={0.70}
      snaps={[0.30, 0.56, 0.70]}
      scrollSelector=".nr-matching-body"
      storageKey="nexride.rider.sheet.matching"
    />
    <div className="nr-matching-body" data-radar={searching ? 'true' : undefined}>
      <div className="bm-hero">
        {searching
          ? <div className="bm-radar" aria-hidden="true"><i/><i/><i/><span><Icon name="locate" size={24}/></span></div>
          : <div className="nr-matching-symbol" aria-hidden="true"><Icon name={status === 'assigned' || status === 'cancelled' ? 'check' : connectionLost || degraded ? 'globe' : 'locate'} size={28} /></div>}
        <header className="bm-heading">
          <h1 tabIndex={-1} ref={heading}>{headline}</h1>
          <p>{subtitle}</p>
        </header>
      </div>
      {!preview && searching && status === 'delayed' && <p className="nr-match-online-wait-note" role="status">
        <Icon name="clock" size={16} />
        <span>{language === "am"
          ? "በአቅራቢያ ያሉ አሽከርካሪዎችን በራስ-ሰር መፈለጉን እንቀጥላለን።"
          : "We’ll keep checking nearby drivers automatically."}</span>
      </p>}
      {!preview && status === 'no_drivers' && <p className="nr-match-online-wait-note" role="status"><Icon name="clock" size={16} /><span>{t('matchingKeepSearchingNote')}</span></p>}
      <span className="nr-sr-only" role="status" aria-live="polite" aria-atomic="true">{headline}</span>
      {searching && <div className="bm-status">
        {!preview && progress && Number.isFinite(startedAt) && now >= startedAt && <div className="bm-timer" role="timer" aria-label={say('Wait time', 'የመጠበቂያ ጊዜ')}>
          <span className="bm-timer-ring" aria-hidden="true">
            <svg viewBox="0 0 52 52" focusable="false"><circle className="bm-ring-track" cx="26" cy="26" r="21"/><circle className="bm-ring-progress" cx="26" cy="26" r="21" style={{ strokeDashoffset: 132 - (Math.min(1, ((now - startedAt) / 1000 % 60) / 60) * 132) }}/></svg>
            <Icon name="clock" size={18}/>
          </span>
          <span className="bm-timer-copy"><small>{say('Wait time', 'የመጠበቂያ ጊዜ')}</small><strong>{elapsedLabel((now - startedAt) / 1000)}</strong><em>{say('Searching nearby', 'በአቅራቢያ በመፈለግ ላይ')}</em></span>
        </div>}
        <div className="bm-steps" aria-label={t('matchingProgress')}>
          <span className="bm-step done"><Icon name="check" size={15}/>{say('Request sent', t('matchingRequestSent'))}</span>
          <span className="bm-step"><i className="bm-dots" aria-hidden="true"><b/><b/><b/></i>{say('Driver confirmation', t('matchingAcceptance'))}</span>
        </div>
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
      <div className="bm-journey" aria-label={t('matchingSummary')}>
        <div className="bm-route">
          <div className="bm-stop"><span className="bm-dot"/><div><small>{t('pickup')}</small><strong>{request.journey.pickup && endpointName(request.journey.pickup, language, t)}</strong></div></div>
          <div className="bm-stop"><span className="bm-dot end"/><div><small>{say('Drop-off', t('dropoff'))}</small><strong>{request.journey.destination && endpointName(request.journey.destination, language, t)}</strong></div></div>
        </div>
        {request.journey.routeState.status === 'ready' && request.journey.routeState.route && <p className="bm-meta" data-traffic={request.journey.routeState.route.traffic?.level || 'unavailable'}>{(request.journey.routeState.route.distanceMeters / 1000).toFixed(1)} {t('kilometers')} · {Math.max(1, Math.round(request.journey.routeState.route.durationSeconds / 60))} {t('minutes')}</p>}
        <div className="bm-fare"><div><strong>{t(request.fare.category)}</strong><small>{t('cash')}</small></div><div><strong>{total !== null ? money(total) : '—'} <span>ETB</span></strong><small>{t(request.fare.priceType === 'sample' ? 'sampleFare' : request.fare.priceType === 'estimate' ? 'estimated' : 'confirmed')}</small></div></div>
        {request.fare.charges.length > 0 && <details className="bm-charges"><summary>{t('matchingCharges')}</summary>{request.fare.charges.map((charge, i) => <p key={i}><span>{charge.name}</span><strong>{money(charge.amount)} ETB</strong></p>)}</details>}
      </div>
      {preview && <p className="nr-match-preview"><strong>{t('preview')}</strong> · {t('findingNote')}</p>}
      {actionFailed && <p className="nr-match-warning" role="alert">{t('matchingActionFailed')}</p>}

      {preview && <details className="nr-match-preview-controls"><summary>{t('matchingPreviewControls')}</summary>
        <div>{(['searching', 'delayed', 'no_drivers', 'connection_lost'] as const).map(s => <button key={s} onClick={() => model.previewState(s)}>{t(s === 'searching' ? 'matchingSearchState' : s === 'delayed' ? 'matchingDelayed' : s === 'no_drivers' ? 'matchingEmpty' : 'matchingConnection')}</button>)}</div>
        <button className="nr-preview-assignment" onClick={previewAssigned}>{t('matchingPreviewAssigned')}<Icon name="arrow" size={16}/></button>
      </details>}
    </div>
    <footer>
      {(connectionLost || degraded) && <Button disabled={busy || reconnecting} loading={reconnecting} onClick={() => void model.reconnect()}>{t(reconnecting ? 'matchingReconnecting' : 'matchingReconnect')}</Button>}
      {!connectionLost && snapshot?.canRetry && <Button disabled={busy} loading={busy} onClick={() => void model.action('retry')}>{t(busy ? 'matchingUpdating' : 'matchingRetry')}</Button>}
      {cancelled ? <>
        <Button disabled={busy} onClick={home}>{t('riderCancelHome')}</Button>
        <Button variant="secondary" disabled={busy} onClick={changeCategory}>{t('riderCancelNewRide')}</Button>
      </> : <>
        {status === 'no_drivers' && <Button variant="ghost" disabled={busy} onClick={home}>{t('home')}</Button>}
        {snapshot?.canChangeCategory && <Button variant="secondary" disabled={busy} onClick={changeCategory}>{t('matchingChangeCategory')}</Button>}
      </>}
      {!cancelled && <Button variant="danger" className="nr-rider-cancel-button bm-cancel" disabled={busy || reconnecting || terms?.allowed === false} onClick={cancel}><Icon name="close" size={17} />{busy ? t('matchingUpdating') : say('Cancel booking', t('matchingCancel'))}</Button>}
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
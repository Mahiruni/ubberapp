'use client';
import { useContext, useEffect, useState } from 'react';
import type { TripSnapshot } from '../../lib/nexride-trip-data';
import { Icon, LanguageContext, useTranslation } from './ui';
import { elapsedLabel, freshDriverFix } from '../../lib/biloo-journey';
import { useRouter } from 'next/navigation';
import './accepted-driver-card.css';
export function AcceptedDriverCard({ snapshot, photo, photoStale, onPhotoError, tripId, safety }: {
  snapshot: TripSnapshot | null; photo: string; photoStale: boolean; onPhotoError: () => void; tripId: string; safety: () => void;
}) {
  const t = useTranslation(), language = useContext(LanguageContext);
  const router = useRouter();
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 5000); return () => window.clearInterval(timer); }, []);
  const driver = snapshot?.driver;
  const active = !!snapshot && ['approaching','arrived','in_trip'].includes(snapshot.status);
  const initials = driver?.name?.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase() || 'N';
  const tracking = snapshot?.tracking;
  const eta = tracking && freshDriverFix(tracking.updatedAt, now) && freshDriverFix(tracking.etaUpdatedAt || 0, now) && Number.isFinite(tracking.etaMinutes) && tracking.etaMinutes! >= 0 ? Math.ceil(tracking.etaMinutes!) : null;
  const trackingFresh = !!tracking && freshDriverFix(tracking.updatedAt, now);
  const metrics = snapshot?.metrics;
  const metricsFresh = trackingFresh && !!metrics && freshDriverFix(metrics.updatedAt, now);
  const remaining = metricsFresh && typeof metrics.remainingMeters === 'number' && Number.isFinite(metrics.remainingMeters) && metrics.remainingMeters >= 0 ? metrics.remainingMeters : null;
  const arrival = metricsFresh && typeof metrics.arrivalAt === 'number' && Number.isFinite(metrics.arrivalAt) ? metrics.arrivalAt : null;
  const phone = driver?.contactPhone && /^\+?[\d\s()-]{7,25}$/.test(driver.contactPhone) ? driver.contactPhone.replace(/[^\d+]/g, '') : '';
  const title = snapshot?.status === 'arrived' ? t('identityArrived') : snapshot?.status === 'in_trip' ? t('identityOnTrip') : snapshot?.status === 'reassigning' ? t('matchingScreen') : t('identityOnWay');
  const share = () => router.push(`/safety?role=rider&trip=${encodeURIComponent(tripId)}`);
  const stage = snapshot?.status === 'in_trip' ? 2 : snapshot?.status === 'arrived' ? 1 : 0;
  return <article className="nr-accepted-driver-card" aria-label={title}>
    <header className="nr-identity-status"><div><p>BILOO · {say('YOUR JOURNEY', 'የእርስዎ ጉዞ')}</p><h2 key={snapshot?.status} aria-live="polite">{title}</h2></div>{(snapshot?.status === 'approaching' || snapshot?.status === 'in_trip') && <span className="nr-identity-eta">{eta != null ? <><b>{eta}</b> {snapshot?.status === 'in_trip' ? say('min left', 'ደቂቃ ይቀራል') : t('identityMinutes')}</> : t('identityETA')}</span>}</header>
    <ol className="biloo-journey-progress" aria-label={say('Journey progress', 'የጉዞ ሂደት')}>
      {[say('On the way', 'በመምጣት ላይ'), say('At pickup', 'መነሻ ላይ'), say('On your way', 'በጉዞ ላይ')].map((label, index) => <li key={label} data-complete={index <= stage} aria-current={index === stage ? 'step' : undefined}><span>{index < stage ? <Icon name="check" size={12}/> : index + 1}</span><small>{label}</small></li>)}
    </ol>
    {active && <p className="biloo-tracking-status" data-fresh={trackingFresh} role="status">
      <span aria-hidden="true"/>{trackingFresh ? say('Driver location live', 'የአሽከርካሪው ቀጥታ ቦታ') : tracking ? say('Location update delayed', 'የቦታ ዝመና ዘግይቷል') : say('Waiting for a live driver location', 'የአሽከርካሪውን ቦታ በመጠባበቅ ላይ')}
    </p>}
    {snapshot?.status === 'arrived' && <div className="biloo-pickup-status"><Icon name="pin" size={20}/><div><strong>{say('Meet your driver at pickup', 'መነሻ ላይ ከአሽከርካሪዎ ጋር ይገናኙ')}</strong><p>{snapshot.arrivedAt ? `${say('Waiting', 'በመጠባበቅ ላይ')} ${elapsedLabel((now - snapshot.arrivedAt) / 1000)}` : say('Your driver confirmed arrival', 'አሽከርካሪዎ መድረሱን አረጋግጧል')}</p></div></div>}
    {snapshot?.status === 'in_trip' && (remaining != null || arrival != null) && <div className="biloo-journey-metrics">
      {remaining != null && <span><Icon name="navigation" size={16}/>{(remaining / 1000).toFixed(1)} km {say('remaining', 'ይቀራል')}</span>}
      {arrival != null && <span><Icon name="clock" size={16}/>{say('Arrival', 'መድረሻ')} {new Date(arrival).toLocaleTimeString(language === 'am' ? 'am-ET' : 'en-ET', { hour: '2-digit', minute: '2-digit' })}</span>}
    </div>}
    <div className="nr-identity-driver">
    <div className="nr-identity-person"><span className="nr-identity-portrait">{photo ? <img src={photo} alt={`${driver?.name || t('identityDriver')} · ${t('photoTitle')}`} onError={onPhotoError}/> : <span aria-label={t('identityDriver')}>{initials}</span>}</span>
      <div><h3>{driver?.name || t('identityLoading')}</h3><div className="nr-identity-stats">{driver?.rating != null && Number.isFinite(driver.rating) && <span aria-label={`Rating ${driver.rating}`}><span aria-hidden="true">★</span> {driver.rating.toFixed(1)}</span>}{driver?.tripCount != null && <span>{driver.tripCount.toLocaleString()} {t('identityTrips')}</span>}</div>{driver?.verification?.status === 'verified' && <p className="nr-identity-verified"><Icon name="check" size={14}/>{t('identityVerified')}</p>}</div>
    </div>
    {photoStale && <small className="nr-identity-stale" role="status">{t('identityStale')}</small>}
    <div className="nr-identity-vehicle"><div><strong>{driver?.vehicle.model || t('identityUnavailable')}</strong><p>{[driver?.vehicle.color,snapshot?.category].filter(Boolean).join(' · ') || t('identityUnavailable')}</p></div><b className="nr-identity-plate">{driver?.vehicle.plate || '—'}</b></div>
    </div>
    <div className="nr-identity-actions">
      <button disabled={!active || !phone} onClick={() => window.location.assign(`tel:${phone}`)} aria-label={t('identityCall')}><Icon name="phone" size={21}/><span>{t('identityCall')}</span></button>
      <button disabled={!active || !driver} onClick={() => router.push(`/trip/chat?ride=${encodeURIComponent(tripId)}&role=rider`)}><Icon name="chat" size={21}/><span>{t('identityChat')}</span></button>
      <button disabled={!driver} onClick={() => void share()}><Icon name="share" size={21}/><span>{t('identityShare')}</span></button>
      <button onClick={safety}><Icon name="shield" size={21}/><span>{t('identitySafety')}</span></button>
    </div>
    <details className="nr-identity-details">
      <summary><span>{say('Trip details', 'የጉዞ ዝርዝሮች')}</span><span className="nr-identity-fare"><small>{say('Estimated fare', 'የተገመተ ዋጋ')}</small><strong>{snapshot?.fare ? `${snapshot.fare.amount.toLocaleString()} ${snapshot.fare.currency}` : t('identityUnavailable')}</strong></span><Icon name="chevron" size={16}/></summary>
      <div className="nr-identity-route"><div><small>{t('identityPickup')}</small><strong>{snapshot?.pickup.name || t('identityUnavailable')}</strong></div><div><small>{t('identityDestination')}</small><strong>{snapshot?.destination.name || t('identityUnavailable')}</strong></div></div>
      {snapshot?.pickup.instructions && <p className="biloo-pickup-instructions"><Icon name="info" size={16}/>{snapshot.pickup.instructions}</p>}
      {tracking && <p className="nr-identity-last-update">{say('Last location update', 'የመጨረሻ የቦታ ዝመና')} <time dateTime={new Date(tracking.updatedAt).toISOString()}>{new Date(tracking.updatedAt).toLocaleTimeString(language === 'am' ? 'am-ET' : 'en-ET', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></p>}
    </details>
  </article>;
}

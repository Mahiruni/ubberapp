'use client';
import { useState } from 'react';
import type { TripSnapshot } from '../../lib/nexride-trip-data';
import { Icon, useTranslation } from './ui';
import './accepted-driver-card.css';
export function AcceptedDriverCard({ snapshot, photo, photoStale, onPhotoError, tripId, safety }: {
  snapshot: TripSnapshot | null; photo: string; photoStale: boolean; onPhotoError: () => void; tripId: string; safety: () => void;
}) {
  const t = useTranslation(), [shareNotice, setShareNotice] = useState('');
  const driver = snapshot?.driver;
  const active = !!snapshot && ['approaching','arrived','in_trip'].includes(snapshot.status);
  const initials = driver?.name?.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase() || 'N';
  const tracking = snapshot?.tracking;
  const now = Date.now();
  const eta = tracking && now-tracking.updatedAt < 45_000 && now-tracking.updatedAt >= -5000 && now-(tracking.etaUpdatedAt || 0)<45_000 && now-(tracking.etaUpdatedAt || 0)>=-5000 && Number.isFinite(tracking.etaMinutes) && tracking.etaMinutes! >= 0 ? Math.ceil(tracking.etaMinutes!) : null;
  const phone = driver?.contactPhone && /^\+?[\d\s()-]{7,25}$/.test(driver.contactPhone) ? driver.contactPhone.replace(/[^\d+]/g, '') : '';
  const title = snapshot?.status === 'arrived' ? t('identityArrived') : snapshot?.status === 'in_trip' ? t('identityOnTrip') : snapshot?.status === 'reassigning' ? t('matchingScreen') : t('identityOnWay');
  const share = async () => {
    const text = `${title}\n${driver?.name || t('identityDriver')}\n${[driver?.vehicle.model,driver?.vehicle.color,driver?.vehicle.plate].filter(Boolean).join(' · ')}\n${snapshot?.pickup.name || ''} → ${snapshot?.destination.name || ''}\nNexRide · ${tripId}`;
    try { if (navigator.share) await navigator.share({ title: 'NexRide', text }); else { await navigator.clipboard.writeText(text); setShareNotice(t('identityShare')); } }
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setShareNotice(t('identityUnavailable')); }
  };
  return <article className="nr-accepted-driver-card" aria-label={title}>
    <header className="nr-identity-status"><div><p>NEXRIDE</p><h2 aria-live="polite">{title}</h2></div>{snapshot?.status === 'approaching' && <span className="nr-identity-eta">{eta != null ? <><b>{eta}</b> {t('identityMinutes')}</> : t('identityETA')}</span>}</header>
    <div className="nr-identity-person"><span className="nr-identity-portrait">{photo ? <img src={photo} alt={`${driver?.name || t('identityDriver')} · ${t('photoTitle')}`} onError={onPhotoError}/> : <span aria-label={t('identityDriver')}>{initials}</span>}</span>
      <div><h3>{driver?.name || t('identityLoading')}</h3><div className="nr-identity-stats">{driver?.rating != null && Number.isFinite(driver.rating) && <span aria-label={`Rating ${driver.rating}`}><span aria-hidden="true">★</span> {driver.rating.toFixed(1)}</span>}{driver?.tripCount != null && <span>{driver.tripCount.toLocaleString()} {t('identityTrips')}</span>}</div>{driver?.verification?.status === 'verified' && <p className="nr-identity-verified"><Icon name="check" size={14}/>{t('identityVerified')}</p>}</div>
    </div>
    {photoStale && <small className="nr-identity-stale" role="status">{t('identityStale')}</small>}
    <div className="nr-identity-vehicle"><div><strong>{driver?.vehicle.model || t('identityUnavailable')}</strong><p>{[driver?.vehicle.color,snapshot?.category].filter(Boolean).join(' · ') || t('identityUnavailable')}</p></div><b className="nr-identity-plate">{driver?.vehicle.plate || '—'}</b></div>
    <div className="nr-identity-actions">
      <button disabled={!active || !phone} onClick={() => window.location.assign(`tel:${phone}`)} aria-label={t('identityCall')}><Icon name="phone" size={21}/><span>{t('identityCall')}</span></button>
      <button disabled={!active || !driver} onClick={() => window.location.assign(`/trip/chat?ride=${encodeURIComponent(tripId)}&role=rider`)}><Icon name="chat" size={21}/><span>{t('identityChat')}</span></button>
      <button disabled={!driver} onClick={() => void share()}><Icon name="share" size={21}/><span>{t('identityShare')}</span></button>
      <button onClick={safety}><Icon name="shield" size={21}/><span>{t('identitySafety')}</span></button>
    </div>
    <div className="nr-identity-route"><div><small>{t('identityPickup')}</small><strong>{snapshot?.pickup.name || t('identityUnavailable')}</strong></div><div><small>{t('identityDestination')}</small><strong>{snapshot?.destination.name || t('identityUnavailable')}</strong></div></div>
    <div className="nr-identity-fare"><span>{t('identityFare')}</span><strong>{snapshot?.fare ? `${snapshot.fare.amount.toLocaleString()} ${snapshot.fare.currency}` : t('identityUnavailable')}</strong></div>
    {shareNotice && <p role="status">{shareNotice}</p>}
  </article>;
}

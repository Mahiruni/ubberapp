'use client';
import { useEffect, useState } from 'react';
import { Button, Icon, useTranslation } from './ui';

export function PermissionSettings() {
  const t = useTranslation();
  const [location, setLocation] = useState<PermissionState | 'unavailable' | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true, status: PermissionStatus | undefined;
    if (!navigator.geolocation) { setLocation('unavailable'); return; }
    navigator.permissions?.query({ name: 'geolocation' }).then(value => {
      if (!active) return;
      status = value; setLocation(value.state);
      value.onchange = () => active && setLocation(value.state);
    }).catch(() => {});
    return () => { active = false; if (status) status.onchange = null; };
  }, []);
  const request = () => {
    if (busy || !navigator.geolocation) return;
    setBusy(true);
    navigator.geolocation.getCurrentPosition(() => { setLocation('granted'); setBusy(false); }, e => { setLocation(e.code === 1 ? 'denied' : 'unknown'); setBusy(false); }, { timeout: 10000 });
  };
  return <section className="nr-permission-settings">
    <div className="nr-settings-block"><span className="nr-settings-icon" data-tone="blue"><Icon name="pin"/></span><div><strong>{t('locationAccess')}</strong><small>{t(location === 'granted' ? 'permissionGranted' : location === 'denied' ? 'permissionDenied' : location === 'unavailable' ? 'permissionUnavailable' : 'permissionAsk')}</small></div>{location !== 'granted' && location !== 'unavailable' && <Button variant="ghost" disabled={busy} onClick={request}>{t(busy ? 'permissionChecking' : 'permissionCheck')}</Button>}</div>
    <p className="nr-muted">{t('permissionDeviceNote')}</p>
  </section>;
}

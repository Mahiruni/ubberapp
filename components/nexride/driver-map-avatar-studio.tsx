'use client';

import Link from 'next/link';
import { useCallback, useContext, useEffect, useState } from 'react';
import { DRIVER_AVATAR_STYLES, VEHICLE_BODY_TYPES, driverMapAvatarSource, type DriverAvatarProfile, type DriverAvatarStyle } from '../../lib/biloo-driver-map-avatar';
import { loadDriverMapAvatar, saveDriverMapAvatar } from '../../lib/biloo-driver-map-avatar-client';
import { Icon, LanguageContext } from './ui';
import styles from './driver-map-avatar-studio.module.css';

export function DriverMapAvatarStudio() {
  const language = useContext(LanguageContext);
  const say = (en: string, am: string) => language === 'am' ? am : en;
  const [profile, setProfile] = useState<DriverAvatarProfile | null>(null);
  const [selected, setSelected] = useState<DriverAvatarStyle>('signature');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const next = await loadDriverMapAvatar(signal);
      if (signal?.aborted) return;
      setProfile(next); setSelected(next.avatar.style);
    } catch {
      if (!signal?.aborted) setError(language === 'am' ? 'የመኪናዎ አቫታር አልተጫነም። እንደገና ይሞክሩ።' : 'Your car avatar couldn’t load. Please try again.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [language]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  async function save() {
    if (busy || !profile?.complete || selected === profile.avatar.style) return;
    setBusy(true); setError(''); setSaved(false);
    try { const next = await saveDriverMapAvatar(selected); setProfile(next); setSelected(next.avatar.style); setSaved(true); }
    catch { setError(say('Couldn’t save your avatar. Your current map car is still in use. Please retry.', 'አቫታሩ አልተቀመጠም። ነባሩ የመኪና አቫታር አሁንም በጥቅም ላይ ነው። እንደገና ይሞክሩ።')); }
    finally { setBusy(false); }
  }
  const body = VEHICLE_BODY_TYPES.find(type => type.value === profile?.avatar.bodyType);
  const changed = profile && selected !== profile.avatar.style;
  return <section id="map-avatar" className={styles.studio} aria-labelledby="driver-map-avatar-title" aria-busy={loading || busy}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{say('MADE FOR YOUR CAR', 'ለመኪናዎ የተዘጋጀ')}</span><h2 id="driver-map-avatar-title">{say('Your car on the map', 'መኪናዎ በካርታ ላይ')}</h2></div>
      <span className={styles.brand}>biloo<span>®</span></span>
    </header>
    {loading ? <div className={styles.loading} role="status">{say('Loading your vehicle…', 'መኪናዎ እየተጫነ ነው…')}</div> : profile ? <>
      <div className={styles.preview} aria-label={say('Map avatar preview', 'የካርታ አቫታር ቅድመ ዕይታ')}>
        <svg className={styles.roads} viewBox="0 0 600 270" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><pattern id="biloo-avatar-blocks" width="94" height="74" patternTransform="rotate(-28)"><rect width="94" height="74" fill="#eaf0ee"/><rect x="11" y="10" width="70" height="48" rx="5" fill="#dce5e1"/><path d="M0 68H94 M88 0V74" stroke="#fff" strokeWidth="9"/></pattern></defs><rect width="600" height="270" fill="url(#biloo-avatar-blocks)"/><path d="M-20 274L600 -55" stroke="#c9d7d0" strokeWidth="49"/><path d="M-20 274L600 -55" stroke="#fff" strokeWidth="43"/><path d="M-20 274L600 -55" stroke="#f9c449" strokeWidth="6"/><path d="M200 350L425 -60" stroke="#fff" strokeWidth="21"/></svg>
        <span className={styles.previewTag}>{say('MAP PREVIEW', 'የካርታ ቅድመ ዕይታ')}</span><span className={styles.north} aria-hidden="true">↑<small>N</small></span>
        <img className={styles.heroCar} src={driverMapAvatarSource({ ...profile.avatar, style: selected })} width={105} height={180} alt={say(`${profile.vehicle.color || 'Neutral'} ${body?.en || ''} with Biloo branding`, `ቢሉ ብራንድ ያለበት ${body?.am || 'መኪና'}`)} />
        <div className={styles.vehicle}><span className={styles.vehicleIcon}><Icon name="shield" size={14}/></span><div><strong>{profile.vehicle.model || say('Vehicle details needed', 'የመኪና መረጃ ያስፈልጋል')}</strong><span>{profile.vehicle.color || say('Color not set', 'ቀለም አልተመረጠም')} · {language === 'am' ? body?.am : body?.en}</span></div></div>
      </div>
      <p className={styles.intro}>{say('A Biloo finish, made to match your registered car. Riders see this same avatar on their map.', 'ከተመዘገበው መኪናዎ ጋር የሚመሳሰል የቢሉ ንድፍ። ተሳፋሪዎችም ተመሳሳይ አቫታር በካርታቸው ላይ ያያሉ።')}</p>
      <fieldset className={styles.choices} disabled={busy || !profile.complete}>
        <legend>{say('Choose your Biloo style', 'የቢሉ ዘይቤዎን ይምረጡ')}</legend>
        <div className={styles.options}>{DRIVER_AVATAR_STYLES.map(style => <label key={style.value} className={styles.option} data-selected={selected === style.value}>
          <input type="radio" name="driver-avatar-style" value={style.value} checked={selected === style.value} onChange={() => { setSelected(style.value); setSaved(false); setError(''); }}/>
          <span className={styles.choiceCheck} aria-hidden="true">{selected === style.value ? '✓' : ''}</span>
          <img src={driverMapAvatarSource({ ...profile.avatar, style: style.value })} width={49} height={84} alt=""/>
          <strong>{language === 'am' ? style.am : style.en}</strong><small>{language === 'am' ? style.amDescription : style.description}</small>
        </label>)}</div>
      </fieldset>
      <div className={styles.note}><Icon name="shield" size={16}/><span>{say('Body type and color follow your vehicle registration. Choose a finish without changing your car details.', 'የመኪናው አይነትና ቀለም ከምዝገባዎ ይመጣሉ። የመኪናዎን መረጃ ሳይቀይሩ ንድፉን ይምረጡ።')} {profile.complete && <Link href="/driver/verification">{say('Review vehicle details', 'የመኪናውን መረጃ ይመልከቱ')} →</Link>}</span></div>
      {!profile.complete && <p className={styles.incomplete}>{say('Add your vehicle model and color to personalize your map car.', 'መኪናዎን ለማበጀት ሞዴሉንና ቀለሙን ያስገቡ።')} <Link href="/driver/verification">{say('Update vehicle', 'መኪናውን ያዘምኑ')} →</Link></p>}
      <button className={styles.save} type="button" onClick={() => void save()} disabled={busy || !changed || !profile.complete}><Icon name="check" size={18}/>{busy ? say('Saving…', 'እየተቀመጠ ነው…') : changed ? say('Use this avatar', 'ይህን አቫታር ተጠቀም') : say('Current map avatar', 'አሁን የሚታየው አቫታር')}</button>
      {saved && <p className={styles.success} role="status">{say('Saved. Your map and the rider’s map use this avatar.', 'ተቀምጧል። የእርስዎና የተሳፋሪው ካርታ ይህን አቫታር ይጠቀማሉ።')}</p>}
    </> : <button className={styles.retry} onClick={() => void load()}>{say('Try again', 'እንደገና ሞክር')}</button>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}

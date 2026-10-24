'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  AVATAR_HAIR, AVATAR_OUTFITS, AVATAR_SKINS, DEFAULT_MAP_AVATAR,
  RIDER_AVATAR_NAMES, avatarPreset, loadMapAvatar, mapAvatarSvg,
  saveMapAvatar, type MapAvatar,
} from '../../lib/biloo-rider-map-avatar';
import { Icon } from './ui';
import './rider-map-avatar-studio.css';

const COLOR_GROUPS = [
  { label: 'Skin tone', key: 'skin', colors: AVATAR_SKINS, names: ['Light', 'Warm', 'Brown', 'Deep brown', 'Rich brown'] },
  { label: 'Hair shade', key: 'hair', colors: AVATAR_HAIR, names: ['Natural black', 'Dark brown', 'Chestnut', 'Golden brown', 'Blue black'] },
  { label: 'Outfit color', key: 'outfit', colors: AVATAR_OUTFITS, names: ['Biloo navy', 'Ocean', 'Ochre', 'Plum', 'Forest', 'Rose'] },
] as const;

export function RiderMapAvatarStudio({ onClose }: { onClose: () => void }) {
  const instance = useId();
  const dirty = useRef(false);
  const [design, setDesign] = useState<MapAvatar>(DEFAULT_MAP_AVATAR);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadMapAvatar().then(saved => {
      if (active && !dirty.current) setDesign(saved);
    }).catch(() => {
      if (active) {
        setMessage('Your saved avatar could not load. Close and reopen to retry.');
        setFailed(true);
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (change: Partial<MapAvatar>) => {
    dirty.current = true;
    setDesign(current => ({ ...current, ...change }));
    setMessage('');
    setFailed(false);
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    setFailed(false);
    try {
      await saveMapAvatar(design);
      dirty.current = false;
      setMessage('Avatar saved to your Rider account.');
    } catch {
      setFailed(true);
      setMessage('Could not save your avatar. Check your connection and sign-in, then try again.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="biloo-avatar-studio" aria-label="Design your map avatar" aria-busy={loading || saving}>
    <div className="biloo-avatar-intro">
      <span className="biloo-avatar-eyebrow">YOUR LOOK, YOUR WAY</span>
      <p>Choose your character. Add your own style.</p>
    </div>

    <div className="biloo-avatar-preview">
      <div className="biloo-avatar-portrait">
        <div className="biloo-avatar-character" dangerouslySetInnerHTML={{ __html: mapAvatarSvg(design, `${instance}-portrait`) }}/>
        <strong>{RIDER_AVATAR_NAMES[design.preset]}</strong>
      </div>
      <div className="biloo-avatar-map-sample">
        <div className="biloo-avatar-map-grid" aria-hidden="true"/>
        <div className="biloo-avatar-map-size" role="img" aria-label="Actual map size: 48 pixels tall">
          <div className="nr-live-location-marker nr-location-identity biloo-custom-map-avatar" data-marker-role="rider" dangerouslySetInnerHTML={{ __html: mapAvatarSvg(design, `${instance}-sample`) }}/>
        </div>
        <span>Actual map size <b>48 px</b></span>
      </div>
    </div>

    <div className="biloo-avatar-section-heading"><h3>Find your character</h3><span>20 looks</span></div>
    <div className="biloo-avatar-collection" role="group" aria-label="Choose your character">
      {RIDER_AVATAR_NAMES.map((name, preset) => <button
        key={name} type="button" disabled={loading || saving}
        aria-label={`Choose character ${String(preset + 1).padStart(2, '0')}: ${name}`}
        aria-pressed={design.preset === preset}
        onClick={() => update(avatarPreset(preset))}
      >
        <span className="biloo-avatar-tile-art" dangerouslySetInnerHTML={{ __html: mapAvatarSvg(avatarPreset(preset), `${instance}-tile-${preset}`) }}/>
        <small>{String(preset + 1).padStart(2, '0')}</small>
        {design.preset === preset && <span className="biloo-avatar-selected" aria-hidden="true"><Icon name="check" size={12}/></span>}
      </button>)}
    </div>

    <div className="biloo-avatar-section-heading"><h3>Make it yours</h3><button type="button" disabled={loading || saving} onClick={() => update(avatarPreset(design.preset))}>Reset colors</button></div>
    <div className="biloo-avatar-customize">
      {COLOR_GROUPS.map(group => <fieldset key={group.key} disabled={loading || saving}>
        <legend>{group.label}</legend>
        <div>{group.colors.map((color, index) => <button key={color}
          type="button" aria-label={`${group.label}: ${group.names[index]}`}
          aria-pressed={design[group.key] === index} style={{ background: color }}
          onClick={() => update({ [group.key]: index })}
        >{design[group.key] === index && <Icon name="check" size={14}/>}</button>)}</div>
      </fieldset>)}
    </div>

    <div className="biloo-avatar-actions">
      {message && <p role={failed ? 'alert' : 'status'} className={failed ? 'biloo-avatar-error' : 'biloo-avatar-success'}>{message}</p>}
      <button className="biloo-avatar-save" type="button" disabled={loading || saving} onClick={() => void save()}>
        <Icon name="check" size={17}/>{loading ? 'Loading your avatar…' : saving ? 'Saving…' : 'Save my avatar'}
      </button>
      <button className="biloo-avatar-done" type="button" disabled={saving} onClick={onClose}>Done</button>
    </div>
  </section>;
}

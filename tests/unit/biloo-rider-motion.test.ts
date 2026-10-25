import { describe, expect, it } from 'vitest';
import { riderLocomotion, freshPickupSignal } from '../../lib/biloo-rider-motion';
import { mapAvatarSvg, avatarPreset } from '../../lib/biloo-rider-avatar-art';

const now = 1_800_000_000_000;
const fix = { lat: 9.008, lng: 38.775, accuracy: 4, timestamp: now };
describe('Rider motion from confirmed device fixes', () => {
  it('uses real pedestrian speed and distinguishes walking from jogging', () => {
    expect(riderLocomotion(null, { ...fix, speed: 0 }, now)).toBe('idle');
    expect(riderLocomotion(null, { ...fix, speed: 1.2 }, now)).toBe('walk');
    expect(riderLocomotion(null, { ...fix, speed: 3.2 }, now)).toBe('jog');
    expect(riderLocomotion(null, { ...fix, speed: 12 }, now)).toBe('idle');
  });
  it('rejects stale, imprecise, out-of-order and malformed fixes', () => {
    for (const next of [{ ...fix, timestamp: now - 15_000 }, { ...fix, accuracy: 80 }, { ...fix, lat: NaN }, { ...fix, timestamp: now + 20_000 }]) expect(riderLocomotion(null, { ...next, speed: 1.5 }, now)).toBe('idle');
    expect(riderLocomotion(fix, { ...fix, speed: 3 }, now)).toBe('idle');
  });
  it('does not mistake GPS jitter or a driver approaching for rider movement', () => {
    expect(riderLocomotion(null, fix, now)).toBe('idle');
    expect(riderLocomotion({ ...fix, timestamp: now - 5000 }, { ...fix, lat: fix.lat + .00001 }, now)).toBe('idle');
    expect(riderLocomotion({ ...fix, timestamp: now - 6000 }, { ...fix, lat: fix.lat + .00008 }, now)).toBe('walk');
    expect(riderLocomotion({ ...fix, timestamp: now - 4000 }, { ...fix, lat: fix.lat + .00012 }, now)).toBe('jog');
  });
  it('expires pickup signals and rejects future or invalid timestamps', () => {
    expect(freshPickupSignal(new Date(now - 5000).toISOString(), now)).toBe(true);
    for (const value of ['invalid', null, new Date(now - 91_000).toISOString(), new Date(now + 6000).toISOString()]) expect(freshPickupSignal(value, now)).toBe(false);
  });
  it('articulates all 20 selected textures without introducing untrusted markup', () => {
    for (let preset = 0; preset < 20; preset++) {
      const svg = mapAvatarSvg(avatarPreset(preset), 'assigned-rider', true);
      expect(svg).toContain(`character-${String(preset + 1).padStart(2, '0')}-v2.webp`);
      expect(svg).toContain('biloo-rider-wave-hand'); expect(svg).toContain('biloo-rider-leg-right');
      expect(svg).toContain(`character-${String(preset + 1).padStart(2, '0')}-wave-v1.webp`);
      expect(svg.match(/<image /g)).toHaveLength(2);
    }
    expect(mapAvatarSvg(avatarPreset(0), '"><script>alert(1)</script>', true)).not.toContain('<script>');
  });
});

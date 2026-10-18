import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { appearanceKey, resolveAppearance } from '../../lib/nexride-appearance';

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
describe('persisted appearance and supporting brand colors', () => {
  it('keeps Rider and Driver device preferences independent', () => {
    expect(appearanceKey('rider')).toBe('nexride.rider.theme');
    expect(appearanceKey('driver')).toBe('nexride.driver.theme');
  });
  it('retires the internal dark theme for every stored or system preference', () => {
    expect(resolveAppearance('system', true)).toBe('light');
    expect(resolveAppearance('system', false)).toBe('light');
    expect(resolveAppearance('light', true)).toBe('light');
    expect(resolveAppearance('dark', false)).toBe('light');
  });
  it('shared semantic text tokens meet AA on light surfaces', () => {
    const css = readFileSync(new URL('../../app/identity-experience.css', import.meta.url), 'utf8');
    for (const family of ['blue', 'teal', 'amber', 'red', 'violet', 'emerald-text']) {
      const color = css.match(new RegExp(`--nr-id-${family}:\\s*(#[a-f0-9]{6})`, 'i'))?.[1];
      expect(color, family).toBeTruthy();
      expect(contrast(color!, '#f5f7f9'), family).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#041c30', '#00c878')).toBeGreaterThanOrEqual(4.5);
  });
});

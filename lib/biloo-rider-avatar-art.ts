export type MapAvatar = { preset: number; skin: number; hair: number; outfit: number };

export const AVATAR_SKINS = ['#f5d2ae', '#e5ac7f', '#b97652', '#8d5037', '#603523'];
export const AVATAR_OUTFITS = ['#173d68', '#197a91', '#d39b36', '#704d9a', '#31775b', '#c45c70'];
export const AVATAR_HAIR = ['#211b22', '#473024', '#79452b', '#a36d3b', '#1a2639'];
export const DEFAULT_MAP_AVATAR: MapAvatar = { preset: 0, skin: 2, hair: 0, outfit: 0 };

export const RIDER_AVATAR_NAMES = [
  'Curl bomber', 'Long braids', 'Textured fade', 'Natural afro',
  'Classic blazer', 'Hijab coat', 'Tied locs', 'Curly knit',
  'Frames jacket', 'Sleek bob', 'Silver cardigan', 'Braided bun',
  'Curly hoodie', 'Twist curls', 'Close crop', 'Headwrap coat',
  'Wavy jacket', 'Wavy denim', 'Silver field jacket', 'Natural cardigan',
] as const;

// CSS pixels, independent of device pixel ratio and map zoom. The bottom of
// the marker is the GPS coordinate; gallery/portrait sizes never enter Mapbox.
export const RIDER_MAP_AVATAR_SIZE = { width: 36, height: 48, anchor: 'bottom' } as const;

export function normalizeMapAvatar(value: unknown): MapAvatar {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const safe = (key: keyof MapAvatar, max: number) =>
    Number.isInteger(v[key]) && Number(v[key]) >= 0 && Number(v[key]) < max ? Number(v[key]) : 0;
  return { preset: safe('preset', 20), skin: safe('skin', 5), hair: safe('hair', 5), outfit: safe('outfit', 6) };
}

export function avatarPreset(preset: number): MapAvatar {
  return normalizeMapAvatar({ ...DEFAULT_MAP_AVATAR, preset });
}

export function riderAvatarSource(preset: number): string {
  const safe = normalizeMapAvatar({ preset }).preset;
  return `/avatars/rider/character-${String(safe + 1).padStart(2, '0')}-v2.webp`;
}

export function riderWaveAvatarSource(preset: number): string {
  return riderAvatarSource(preset).replace('-v2.webp', '-wave-v1.webp');
}

function tintMatrix(color: string, midpoint: number): string {
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255 / midpoint);
  return channels.map(channel => `${channel * .2126} ${channel * .7152} ${channel * .0722} 0 0`).join(' ') + ' 0 0 0 1 0';
}

/** Render the same optimized, transparent 3D artwork in the picker and Mapbox.
 * Optional SVG color masks preserve the existing skin/hair/outfit controls,
 * including light/shadow texture, without recoloring the whole character.
 * All URLs, colors, identifiers and attributes come from normalized constants.
 */
export function mapAvatarSvg(value: MapAvatar, instance = 'map', rigged = false): string {
  const a = normalizeMapAvatar(value);
  const id = `biloo-avatar-${instance.replace(/[^a-zA-Z0-9_-]/g, '')}-${a.preset}-${a.skin}-${a.hair}-${a.outfit}`;
  let input = 'SourceGraphic';
  let filters = '';
  const tint = (name: string, mask: string, color: string, midpoint: number, gate?: string) => {
    filters += `<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${mask}" result="${name}-key"/>`;
    if (gate) {
      filters += `<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${gate}" result="${name}-gate"/><feComposite in="${name}-key" in2="${name}-gate" operator="in" result="${name}-key"/>`;
    }
    filters += `<feComposite in="${name}-key" in2="SourceAlpha" operator="in" result="${name}-mask"/><feColorMatrix in="SourceGraphic" type="matrix" values="${tintMatrix(color, midpoint)}" result="${name}-color"/><feComposite in="${name}-color" in2="${name}-mask" operator="in" result="${name}-tint"/><feComposite in="${input}" in2="${name}-mask" operator="out" result="${name}-base"/><feComposite in="${name}-tint" in2="${name}-base" operator="over" result="${name}-result"/>`;
    input = `${name}-result`;
  };
  if (a.skin !== DEFAULT_MAP_AVATAR.skin) tint('skin', '9 -7 -3 0 -.25', AVATAR_SKINS[a.skin], .48, '2 2 1 0 -.45');
  if (a.hair !== DEFAULT_MAP_AVATAR.hair) tint('hair', '-3 -4 -1 0 1.2', AVATAR_HAIR[a.hair], .11, '8 0 -8 0 .3');
  if (a.outfit !== DEFAULT_MAP_AVATAR.outfit) tint('outfit', '-10 1 10 0 -.18', AVATAR_OUTFITS[a.outfit], .22);
  const filter = filters ? `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${filters}</filter>` : '';
  const texture = `<image ${rigged ? `id="${id}-texture" ` : ''}href="${riderAvatarSource(a.preset)}" width="192" height="320" preserveAspectRatio="xMidYMax meet"${filters ? ` filter="url(#${id})"` : ''}/>`;
  // A separate, identity-matched pose gives every character a natural bent
  // elbow and open hand. Only the palm gently turns; the body is never rocked.
  const wristX = [143,151,151,155,151,153,158,162,153,157,157,157,155,160,160,159,154,162,158,158][a.preset];
  const wristY = [69,78,77,87,76,80,87,96,79,90,81,88,78,91,85,88,80,87,80,88][a.preset];
  const hand = `M ${wristX - 20} 0 H 192 V ${wristY + 1} H ${wristX - 9} L ${wristX - 20} ${wristY - 20} Z`;
  const waveTexture = `<image id="${id}-wave-texture" href="${riderWaveAvatarSource(a.preset)}" width="192" height="320"${filters ? ` filter="url(#${id})"` : ''}/>`;
  const rig = rigged ? `<defs>${filter}${texture}${waveTexture}
    <clipPath id="${id}-upper"><rect width="192" height="200"/></clipPath>
    <clipPath id="${id}-leg-left"><rect x="0" y="199" width="97" height="121"/></clipPath>
    <clipPath id="${id}-leg-right"><rect x="96" y="199" width="96" height="121"/></clipPath>
    <clipPath id="${id}-hand"><path d="${hand}"/></clipPath>
    <mask id="${id}-wave-body" maskUnits="userSpaceOnUse" x="0" y="0" width="192" height="320"><rect width="192" height="320" fill="white"/><path d="${hand}" fill="black"/></mask>
  </defs><g class="biloo-rider-rig">
    <g class="biloo-rider-still"><use href="#${id}-texture"/></g>
    <g class="biloo-rider-walk-pose"><g clip-path="url(#${id}-upper)"><use href="#${id}-texture"/></g>${['left','right'].map(side => `<g class="biloo-rider-leg-${side}"><g clip-path="url(#${id}-leg-${side})"><use href="#${id}-texture"/></g></g>`).join('')}</g>
    <g class="biloo-rider-wave-pose"><use href="#${id}-wave-texture" mask="url(#${id}-wave-body)"/><g class="biloo-rider-wave-hand" style="transform-origin:${wristX}px ${wristY}px"><g clip-path="url(#${id}-hand)"><use href="#${id}-wave-texture"/></g></g></g>
  </g>` : `${filter ? `<defs>${filter}</defs>` : ''}${texture}`;
  return `<svg class="biloo-rider-avatar-art" data-avatar-preset="${a.preset}" data-artwork="premium-v2"${rigged ? ' data-rigged="true"' : ''} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 320" width="192" height="320" aria-hidden="true" focusable="false">${rig}</svg>`;
}

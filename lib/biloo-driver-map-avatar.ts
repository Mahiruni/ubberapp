import { normalizeVehicleColor, type VehicleColor } from './nexride-vehicle';

export const DRIVER_AVATAR_ACCOUNT_KEY = 'biloo_driver_map_avatar';
export const VEHICLE_BODY_TYPES = [
  { value: 'sedan', en: 'Sedan', am: 'ሴዳን' },
  { value: 'hatchback', en: 'Hatchback', am: 'ሃችባክ' },
  { value: 'suv', en: 'SUV', am: 'ኤስዩቪ' },
  { value: 'van', en: 'Van / MPV', am: 'ቫን / ኤምፒቪ' },
] as const;
export const DRIVER_AVATAR_STYLES = [
  { value: 'signature', en: 'Signature', am: 'ሲግኔቸር', description: 'The Biloo original', amDescription: 'የቢሉ ዋና ንድፍ' },
  { value: 'goldline', en: 'Goldline', am: 'ጎልድላይን', description: 'A touch of gold', amDescription: 'ወርቃማ ውበት' },
  { value: 'executive', en: 'Executive', am: 'ኤግዚኪዩቲቭ', description: 'Refined navy details', amDescription: 'ያማረ ጥቁር ሰማያዊ ንድፍ' },
] as const;
export type VehicleBodyType = typeof VEHICLE_BODY_TYPES[number]['value'];
export type DriverAvatarStyle = typeof DRIVER_AVATAR_STYLES[number]['value'];
export type DriverMapAvatar = { bodyType: VehicleBodyType; color: VehicleColor | ''; style: DriverAvatarStyle };
export type DriverAvatarProfile = { avatar: DriverMapAvatar; vehicle: { model: string; color: string; bodyType: VehicleBodyType }; complete: boolean };

export const DEFAULT_DRIVER_MAP_AVATAR: DriverMapAvatar = { bodyType: 'sedan', color: '', style: 'signature' };
export const normalizeVehicleBodyType = (value: unknown): VehicleBodyType | '' =>
  VEHICLE_BODY_TYPES.find(option => option.value === value)?.value || '';
export const normalizeDriverAvatarStyle = (value: unknown): DriverAvatarStyle | null =>
  DRIVER_AVATAR_STYLES.find(option => option.value === value)?.value || null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const modelKey = (value: unknown) => text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A presentation default for older registrations; never changes ride category or capacity. */
export function inferVehicleBodyType(model: unknown): VehicleBodyType {
  const name = modelKey(model);
  if (/\b(sedan|saloon)\b/.test(name)) return 'sedan';
  if (/\b(hiace|sienna|noah|voxy|alphard|vellfire|starex|h1|h 1|h100|h 100|caravan|minivan|van|mpv|transit|serena|odyssey|vito|v class|multivan)\b/.test(name)) return 'van';
  if (/\b(suv|crossover|rav4|rav 4|highlander|land cruiser|prado|fortuner|rush|terios|cr v|crv|hr v|hrv|tucson|santa fe|sportage|sorento|qashqai|x trail|xtrail|outlander|forester|crosstrek|cx 5|cx5|cx 9|cx9|duster|kicks|kona|creta|venue|ecosport|escape|explorer|tiguan|touareg|q3|q5|q7|x1|x3|x5|x7|glc|gle|gls|model y|model x|byd atto|atto 3|tang|song|sealion|seagull suv)\b/.test(name)) return 'suv';
  if (/\b(hatchback|hatch|vitz|yaris|ist|passo|aqua|fit|jazz|march|micra|note|swift|baleno|alto|picanto|i10|i20|getz|golf|polo|leaf|bolt|dolphin|seagull|e star|estar|changan benben|zoe|mini cooper|prius)\b/.test(name)) return 'hatchback';
  return 'sedan';
}

export function normalizeDriverMapAvatar(value: unknown): DriverMapAvatar {
  const source = record(value);
  return { bodyType: normalizeVehicleBodyType(source.bodyType) || 'sedan', color: normalizeVehicleColor(source.color), style: normalizeDriverAvatarStyle(source.style) || 'signature' };
}

/** Paint/model come from the registered Driver row. Metadata is cosmetic only. */
export function resolveDriverMapAvatar(vehicle: { model?: unknown; color?: unknown }, metadata: unknown = {}): DriverMapAvatar {
  const meta = record(metadata);
  const registeredBody = modelKey(meta.vehicle) === modelKey(vehicle.model) ? normalizeVehicleBodyType(meta.vehicle_body_type) : '';
  return { bodyType: registeredBody || inferVehicleBodyType(vehicle.model), color: normalizeVehicleColor(vehicle.color), style: normalizeDriverAvatarStyle(record(meta[DRIVER_AVATAR_ACCOUNT_KEY]).style) || 'signature' };
}

export function driverAvatarProfile(vehicle: { model?: unknown; color?: unknown }, metadata: unknown): DriverAvatarProfile {
  const avatar = resolveDriverMapAvatar(vehicle, metadata);
  return { avatar, vehicle: { model: text(vehicle.model), color: avatar.color, bodyType: avatar.bodyType }, complete: Boolean(text(vehicle.model) && avatar.color) };
}

export function driverMapAvatarSource(value: unknown): string {
  const avatar = normalizeDriverMapAvatar(value);
  return `/brand/driver-avatar?bodyType=${avatar.bodyType}&color=${avatar.color || 'unknown'}&style=${avatar.style}`;
}

const paints: Record<VehicleColor | '', [string, string, string]> = {
  '': ['#d2d7db', '#a2adb7', '#546472'], White: ['#ffffff', '#edf1f5', '#9eabb6'],
  Black: ['#66717d', '#242d38', '#080e17'], Silver: ['#f1f5f7', '#b7c2cc', '#637888'],
  Gray: ['#bcc5ce', '#778592', '#364858'], Blue: ['#7bb5e8', '#2464a3', '#133450'],
  Red: ['#f99996', '#bc333d', '#641b2c'], Green: ['#92c9ac', '#307b62', '#173e36'],
  Brown: ['#c4a58b', '#82614c', '#44312c'], Beige: ['#f3e7d2', '#cebaa0', '#8b7662'],
  Gold: ['#f9e4a6', '#c4a05c', '#82612f'], Yellow: ['#fff2a0', '#efc438', '#b48b22'],
  Orange: ['#ffd5a1', '#e78a38', '#a14b21'],
};

/** Original vector art: raised body, metallic paint, glass, tires and Biloo livery.
 * Only allowlisted enums enter SVG. No user text, external resources or scripts. */
export function driverMapAvatarSvg(value: unknown): string {
  const avatar = normalizeDriverMapAvatar(value);
  const [light, base, dark] = paints[avatar.color];
  const wide = avatar.bodyType === 'suv' || avatar.bodyType === 'van';
  const van = avatar.bodyType === 'van', hatch = avatar.bodyType === 'hatchback';
  const left = wide ? 24 : 28, right = 120 - left;
  const rear = hatch ? 169 : 185, roofTop = van ? 62 : 78, roofBottom = van ? 147 : hatch ? 125 : 130;
  const body = `M${left + 14} 14 Q60 5 ${right - 14} 14 Q${right} 20 ${right} 43 L${right + 2} ${rear - 30} Q${right + 1} ${rear - 5} ${right - 14} ${rear} Q60 ${rear + 7} ${left + 14} ${rear} Q${left - 1} ${rear - 5} ${left - 2} ${rear - 30} L${left} 43 Q${left} 20 ${left + 14} 14Z`;
  const stripe = avatar.style === 'goldline' ? `<path d="M${left + 6} 39V${rear - 25} M${right - 6} 39V${rear - 25}" stroke="#f9c449" stroke-width="4" opacity=".95"/><path d="M48 20V45 M72 20V45" stroke="#f9c449" stroke-width="3"/>`
    : avatar.style === 'executive' ? `<path d="M${left + 4} 51V${rear - 24} M${right - 4} 51V${rear - 24}" stroke="#08295f" stroke-width="7"/><path d="M${left + 4} 57V${rear - 30} M${right - 4} 57V${rear - 30}" stroke="#f9c449" stroke-width="1.2"/>`
    : `<path d="M${left + 5} 93V${rear - 27} M${right - 5} 93V${rear - 27}" stroke="#f9c449" stroke-width="3"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 206" width="120" height="206" role="img" aria-label="Biloo ${avatar.bodyType} map avatar"><defs>
    <linearGradient id="paint" x1="0" y1="0" x2="1" y2=".2"><stop stop-color="${dark}"/><stop offset=".14" stop-color="${base}"/><stop offset=".35" stop-color="${light}"/><stop offset=".65" stop-color="${base}"/><stop offset=".87" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="roof" x1="0" y1="0" x2="1" y2=".65"><stop stop-color="${light}"/><stop offset=".5" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#83adc3"/><stop offset=".25" stop-color="#365b73"/><stop offset=".62" stop-color="#152a40"/><stop offset="1" stop-color="#0a1728"/></linearGradient>
    <linearGradient id="tire"><stop stop-color="#0b1018"/><stop offset=".45" stop-color="#414b57"/><stop offset=".6" stop-color="#131d29"/><stop offset="1" stop-color="#050a11"/></linearGradient>
    <filter id="shadow" x="-40%" y="-25%" width="180%" height="160%"><feDropShadow dx="3" dy="7" stdDeviation="4" flood-color="#061a31" flood-opacity=".35"/></filter>
  </defs><g filter="url(#shadow)">
    <rect x="${left - 6}" y="41" width="12" height="34" rx="5" fill="url(#tire)"/><rect x="${right - 6}" y="41" width="12" height="34" rx="5" fill="url(#tire)"/>
    <rect x="${left - 6}" y="${rear - 53}" width="12" height="34" rx="5" fill="url(#tire)"/><rect x="${right - 6}" y="${rear - 53}" width="12" height="34" rx="5" fill="url(#tire)"/>
    <path d="${body}" transform="translate(0 4)" fill="${dark}" stroke="#122335" stroke-width="1.4"/>
    <path d="${body}" fill="url(#paint)" stroke="#ffffff" stroke-opacity=".65" stroke-width="1.1"/>
    <path d="M${left + 10} 35Q60 23 ${right - 10} 35L${right - 14} 49Q60 43 ${left + 14} 49Z" fill="url(#roof)"/>
    <path d="M${left + 10} 53Q60 44 ${right - 10} 53L${right - 14} ${roofTop}Q60 ${roofTop - 5} ${left + 14} ${roofTop}Z" fill="url(#glass)" stroke="${dark}" stroke-width="2"/>
    <path d="M${left + 12} 55Q60 48 ${right - 12} 55" fill="none" stroke="#d3eefb" stroke-opacity=".6" stroke-width="1.6"/>
    <path d="M${left + 7} ${roofTop + 2}L${left + 13} ${roofTop + 6}V${roofBottom - 2}L${left + 6} ${roofBottom + 12}Z M${right - 7} ${roofTop + 2}L${right - 13} ${roofTop + 6}V${roofBottom - 2}L${right - 6} ${roofBottom + 12}Z" fill="url(#glass)"/>
    <path d="M${left + 16} ${roofTop - 1}Q60 ${roofTop - 6} ${right - 16} ${roofTop - 1}L${right - 13} ${roofBottom}Q60 ${roofBottom + 6} ${left + 13} ${roofBottom}Z" fill="url(#roof)" stroke="${light}" stroke-width="1"/>
    <path d="M${left + 16} ${roofBottom + 5}Q60 ${roofBottom + 10} ${right - 16} ${roofBottom + 5}L${right - 9} ${rear - 25}Q60 ${rear - 19} ${left + 9} ${rear - 25}Z" fill="url(#glass)" stroke="${dark}" stroke-width="1.5"/>
    <path d="M${left + 18} ${roofTop + 4}V${roofBottom - 5}" stroke="white" stroke-width="1.7" stroke-opacity=".5"/>
    <path d="M${left + 3} 81H${left + 13} M${right - 13} 81H${right - 3}" stroke="${dark}" stroke-width="2"/>
    <path d="M${left + 4} ${roofTop - 4}L${left - 5} ${roofTop - 1}L${left - 6} ${roofTop + 8}L${left + 3} ${roofTop + 7} M${right - 4} ${roofTop - 4}L${right + 5} ${roofTop - 1}L${right + 6} ${roofTop + 8}L${right - 3} ${roofTop + 7}" fill="${base}" stroke="${dark}" stroke-width="1"/>
    ${stripe}
    <rect x="43" y="${Math.round((roofTop + roofBottom) / 2) - 10}" width="34" height="21" rx="5" fill="${avatar.style === 'goldline' ? '#f9c449' : '#08295f'}" stroke="#f9c449" stroke-width="1"/>
    <text x="60" y="${Math.round((roofTop + roofBottom) / 2) + 4}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="800" letter-spacing="-.6" fill="${avatar.style === 'goldline' ? '#08295f' : '#ffffff'}">biloo</text>
    ${wide ? `<path d="M${left + 12} ${roofTop + 4}V${roofBottom - 4} M${right - 12} ${roofTop + 4}V${roofBottom - 4}" stroke="${dark}" stroke-width="2.4"/>` : ''}
    <path d="M${left + 6} 26L${left + 18} 23 M${right - 18} 23L${right - 6} 26" stroke="#f6fbff" stroke-width="5" stroke-linecap="round"/>
    <path d="M${left + 8} ${rear - 6}L${left + 20} ${rear - 3} M${right - 20} ${rear - 3}L${right - 8} ${rear - 6}" stroke="#d63c4b" stroke-width="4" stroke-linecap="round"/>
    <path d="M46 17Q60 14 74 17" fill="none" stroke="#112638" stroke-width="3" stroke-linecap="round"/>
    <path d="M${left + 5} 34Q${left + 1} 100 ${left + 5} ${rear - 22}" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="1.2"/>
    <path d="M46 ${rear - 1}H74" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>
  </g></svg>`;
}

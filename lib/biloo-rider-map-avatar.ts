import { supabase } from './supabase';

export type MapAvatar = { preset: number; skin: number; hair: number; outfit: number };
export const DEFAULT_MAP_AVATAR: MapAvatar = { preset: 0, skin: 2, hair: 0, outfit: 0 };
export const AVATAR_SKINS = ['#f5d2ae','#e5ac7f','#b97652','#8d5037','#603523'];
export const AVATAR_OUTFITS = ['#173d68','#197a91','#d39b36','#704d9a','#31775b','#c45c70'];
export const AVATAR_HAIR = ['#211b22','#473024','#79452b','#a36d3b','#1a2639'];
export const AVATAR_STORAGE = 'biloo:rider-map-avatar:';
export function normalizeMapAvatar(value: unknown): MapAvatar {
  const v = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const safe = (key: keyof MapAvatar, max: number) => Number.isInteger(v[key]) && Number(v[key]) >= 0 && Number(v[key]) < max ? Number(v[key]) : 0;
  return { preset:safe('preset',20), skin:safe('skin',5), hair:safe('hair',5), outfit:safe('outfit',6) };
}
export function mapAvatarSvg(a: MapAvatar): string {
  const skin = AVATAR_SKINS[a.skin], shirt = AVATAR_OUTFITS[a.outfit], hair = AVATAR_HAIR[a.hair];
  const hairstyle = a.preset % 5;
  const longHair = hairstyle === 1 || hairstyle === 3;
  const skirt = a.preset % 4 === 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 140" role="img" aria-label="Your customized map avatar">
  <defs><linearGradient id="coat" x2="1" y2=".25"><stop stop-color="${shirt}"/><stop offset=".5" stop-color="${shirt}"/><stop offset="1" stop-color="#0c233d"/></linearGradient><radialGradient id="face"><stop stop-color="${skin}"/><stop offset="1" stop-color="#8e563e"/></radialGradient></defs>
  <ellipse cx="45" cy="132" rx="27" ry="6" fill="#0c2a4b" opacity=".2"/>
  <path d="M30 88L27 123Q34 130 41 124L45 99 49 124Q58 130 64 123L60 88" fill="#283c57"/>
  <path d="M26 122Q20 131 31 133H44V125L30 122M50 125V133H64Q73 130 62 122Z" fill="#162a43"/>
  <path d="M30 47Q15 48 15 66L12 90Q15 97 22 92L28 71 27 93H63L62 71 68 92Q76 96 78 89L75 66Q73 48 60 47Z" fill="url(#coat)" stroke="#ffffff" stroke-opacity=".3"/>
  <path d="M39 41H51V54Q45 60 39 54Z" fill="${skin}"/>
  ${longHair ? `<path d="M26 20Q26 2 45 2Q66 2 66 22L69 55Q57 64 53 46H36Q31 64 22 54Z" fill="${hair}"/>` : ''}
  <ellipse cx="45" cy="27" rx="18" ry="23" fill="url(#face)"/>
  <path d="${hairstyle===4?'M26 23Q24 -1 47 4Q65 2 64 24L56 14Q43 23 27 20Z':hairstyle===2?'M26 24Q21 4 42 4Q65 -2 64 24L52 14Q38 25 26 24Z':'M27 23Q24 5 43 4Q64 2 63 23L57 14Q42 18 27 23Z'}" fill="${hair}"/>
  <path d="M36 29h4m10 0h4" stroke="#332a2a" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M41 39Q45 42 49 39" fill="none" stroke="#784338" stroke-width="1.7" stroke-linecap="round"/>
  ${skirt?'<path d="M27 86H63L69 104H21Z" fill="'+shirt+'"/>':''}
  <path d="M20 88l-2 11m52-11 2 11" stroke="${skin}" stroke-width="8" stroke-linecap="round"/>
  </svg>`;
}
export async function loadMapAvatar(): Promise<MapAvatar> {
 const {data:{user}} = await supabase.auth.getUser();
 if(!user) return DEFAULT_MAP_AVATAR;
 const {data,error} = await supabase.from('rider_map_avatars').select('design').eq('user_id',user.id).maybeSingle();
 if(error) throw error;
 const design = normalizeMapAvatar(data?.design || DEFAULT_MAP_AVATAR);
 try {localStorage.setItem(AVATAR_STORAGE+user.id,JSON.stringify(design));} catch {}
 return design;
}
export async function saveMapAvatar(design:MapAvatar):Promise<void> {
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError || !user) throw new Error('Sign in to save your avatar across devices.');
 const normalized=normalizeMapAvatar(design);
 const {error}=await supabase.from('rider_map_avatars').upsert({user_id:user.id,design:normalized,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(error) throw error;
 try {localStorage.setItem(AVATAR_STORAGE+user.id,JSON.stringify(normalized));} catch {}
 window.dispatchEvent(new CustomEvent('biloo:rider-avatar-updated',{detail:normalized}));
}

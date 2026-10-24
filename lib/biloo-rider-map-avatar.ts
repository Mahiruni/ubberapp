import { supabase } from './supabase';

import { DEFAULT_MAP_AVATAR, normalizeMapAvatar, type MapAvatar } from './biloo-rider-avatar-art';
export { AVATAR_HAIR, AVATAR_OUTFITS, AVATAR_SKINS, DEFAULT_MAP_AVATAR, RIDER_AVATAR_NAMES, RIDER_MAP_AVATAR_SIZE, avatarPreset, mapAvatarSvg, normalizeMapAvatar, riderAvatarSource, type MapAvatar } from './biloo-rider-avatar-art';

export const AVATAR_STORAGE = 'biloo:rider-map-avatar:';
export const AVATAR_ACCOUNT_KEY = 'biloo_rider_map_avatar';

const missingAvatarTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01';

export async function loadMapAvatar(): Promise<MapAvatar> {
 const {data:{user},error:authError} = await supabase.auth.getUser();
 if(authError && authError.name !== 'AuthSessionMissingError') throw authError;
 if(!user) return DEFAULT_MAP_AVATAR;
 const {data,error} = await supabase.from('rider_map_avatars').select('design').eq('user_id',user.id).maybeSingle();
 if(error && !missingAvatarTable(error)) throw error;
 // Cosmetic preferences can use Auth metadata when the optional avatar table
 // has not been provisioned. Never use this user-editable value for access checks.
 const design = normalizeMapAvatar(data?.design || user.user_metadata?.[AVATAR_ACCOUNT_KEY] || DEFAULT_MAP_AVATAR);
 try {localStorage.setItem(AVATAR_STORAGE+user.id,JSON.stringify(design));} catch {}
 return design;
}
export async function saveMapAvatar(design:MapAvatar):Promise<void> {
 const {data:{user},error:authError}=await supabase.auth.getUser();
 if(authError || !user) throw new Error('Sign in to save your avatar across devices.');
 const normalized=normalizeMapAvatar(design);
 const {error}=await supabase.from('rider_map_avatars').upsert({user_id:user.id,design:normalized,updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(missingAvatarTable(error)) {
   const {error:metadataError}=await supabase.auth.updateUser({data:{[AVATAR_ACCOUNT_KEY]:normalized}});
   if(metadataError) throw metadataError;
 } else if(error) throw error;
 try {localStorage.setItem(AVATAR_STORAGE+user.id,JSON.stringify(normalized));} catch {}
 window.dispatchEvent(new CustomEvent('biloo:rider-avatar-updated',{detail:normalized}));
}

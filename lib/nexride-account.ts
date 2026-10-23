import { supabase } from './supabase';
import { RIDER_AVATAR_EXTENSIONS, riderAvatarValidation } from './nexride-rider-avatar';
import type { PreviewProfile } from './nexride-preview';
export type RiderAccount = { id: string; profile: PreviewProfile; avatar: string | null; avatarPath: string | null };
export const ALERTS_KEY = 'nexride:trip-alerts';
export function validateProfile(profile: PreviewProfile): 'name' | 'phone' | 'email' | null {
  if (profile.name.trim().length < 2 || profile.name.trim().length > 80) return 'name';
  const phone = profile.phone.trim(), digits = phone.replace(/\D/g, '');
  if (phone && (!/^\+?[\d\s()-]{7,25}$/.test(phone) || digits.length < 7 || digits.length > 15)) return 'phone';
  if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) return 'email';
  return null;
}
// Brief, user-scoped cache prevents repeat profile and signed-URL fetches during tab navigation.
// Never cache payment, verification, dispatch, or live-trip state here.
const ACCOUNT_CACHE_MS = 4 * 60_000; // Signed private URLs expire at 60 minutes.
let accountCache: { userId: string; expiresAt: number; value: RiderAccount } | null = null;
let accountPending: { userId: string; promise: Promise<RiderAccount> } | null = null;
export function invalidateRiderAccountCache() { accountCache = null; accountPending = null; }

export async function readAccount(): Promise<RiderAccount | null> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) { invalidateRiderAccountCache(); return null; }
  const userId = session.session.user.id;
  if (accountCache?.userId === userId && accountCache.expiresAt > Date.now()) return accountCache.value;
  if (accountPending?.userId === userId) return accountPending.promise;
  const promise: Promise<RiderAccount> = (async () => {
    const { data, error } = await supabase.from('profiles')
      .select('id,full_name,phone,avatar_path').eq('id', userId).single();
    if (error || !data || data.id !== userId) throw error || Error('Profile unavailable');
    let avatar: string | null = null;
    if (typeof data.avatar_path === 'string' && data.avatar_path) {
      if (data.avatar_path.startsWith('https://')) avatar = data.avatar_path;
      else {
        const signed = await supabase.storage.from('profile-photos').createSignedUrl(data.avatar_path, 3600);
        avatar = signed.data?.signedUrl || null;
      }
    }
    // Legacy Driver identities may have an approved portrait but no shared
    // profiles.avatar_path yet. Use the same fallback for BOTH experiences,
    // without copying or modifying verification evidence.
    if (!avatar) {
      const legacy = await supabase.from('driver_profile_photos')
        .select('storage_path').eq('driver_id', userId).eq('status', 'approved')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!legacy.error && legacy.data?.storage_path) {
        const signed = await supabase.storage.from('nexride-driver-photos')
          .createSignedUrl(legacy.data.storage_path, 900);
        avatar = signed.data?.signedUrl || null;
      }
    }
    const value: RiderAccount = {
      id: data.id,
      profile: { name: data.full_name || '', phone: data.phone || '', email: session.session.user.email || '' },
      avatar,
      avatarPath: typeof data.avatar_path === 'string' ? data.avatar_path : null,
    };
    return value;
  })();
  accountPending = { userId, promise };
  try {
    const value = await promise;
    // Do not cache a result invalidated by an avatar or profile mutation in flight.
    if (accountPending?.promise === promise) accountCache = { userId, expiresAt: Date.now() + ACCOUNT_CACHE_MS, value };
    return value;
  } finally { if (accountPending?.promise === promise) accountPending = null; }
}
export async function saveAccount(account: RiderAccount, profile: PreviewProfile): Promise<PreviewProfile> {
  if (validateProfile(profile)) throw Error('Invalid profile');
  const auth = await supabase.auth.getUser();
  if (auth.error || auth.data.user?.id !== account.id) throw Error('Session changed');
  // Contact-phone ownership is managed only through Auth OTP; changing a
  // display field here must not bypass one-number-one-owner verification.
  const { data, error } = await supabase.from('profiles').update({ full_name: profile.name.trim() })
    .eq('id', account.id).select('id,full_name,phone').single();
  if (error || !data || data.id !== account.id) throw error || Error('Save not confirmed');
  invalidateRiderAccountCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('nexride:profile-change'));
  return { name: data.full_name || '', phone: data.phone || '', email: auth.data.user.email || '' };
}

/** Rider portraits are immediately effective on the account owner's profile.
 * Driver portraits use their own private, immediately active profile-photo workflow.
 */
export async function uploadRiderAvatar(
  account: RiderAccount,
  file: File,
  thumbnail?: Blob | null,
): Promise<{ avatar: string | null; avatarPath: string }> {
  const invalid = riderAvatarValidation(file);
  if (invalid) throw new Error(invalid === 'type' ? 'avatar_invalid_type' : 'avatar_invalid_size');

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user || auth.user.id !== account.id) throw new Error('avatar_auth_required');

  // Never overwrite an approved or unrelated image. A unique per-owner path
  // lets replacement complete atomically before the obsolete file is removed.
  const path = `${account.id}/${crypto.randomUUID()}.${RIDER_AVATAR_EXTENSIONS[file.type]}`;
  const storage = supabase.storage.from('profile-photos');
  const uploaded = await storage.upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  // New uploads have one private high-resolution master and an inexpensive
  // 256px WebP for navigation. Legacy photos continue working unchanged.
  const thumbnailPath = thumbnail?.type === 'image/webp'
    ? path.replace(/\\.[^.]+$/, '.thumb.webp') : '';
  let avatarPath = path;
  if (thumbnailPath) {
    const small = await storage.upload(thumbnailPath, thumbnail!, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    if (!small.error) avatarPath = thumbnailPath;
  }

  const updated = await supabase.from('profiles')
    .update({ avatar_path: avatarPath })
    .eq('id', account.id)
    .select('avatar_path')
    .single();

  if (updated.error || updated.data?.avatar_path !== avatarPath) {
    // Best-effort cleanup; do not strand a visible photo when the profile
    // update was not committed successfully.
    await storage.remove([path, ...(avatarPath !== path ? [avatarPath] : [])]).catch(() => {});
    throw updated.error || new Error('avatar_save_failed');
  }

  invalidateRiderAccountCache();
  const signed = await storage.createSignedUrl(avatarPath, 3600);
  // A successful profile update must never be reported as failed solely
  // because URL generation was temporarily unavailable.
  const avatar = signed.data?.signedUrl || null;

  if (account.avatarPath && !account.avatarPath.startsWith('https://') &&
      account.avatarPath.startsWith(`${account.id}/`) && account.avatarPath !== avatarPath) {
    const previousMaster = account.avatarPath.endsWith('.thumb.webp')
      ? account.avatarPath.replace(/\\.thumb\\.webp$/, '.jpg') : null;
    void storage.remove([account.avatarPath, ...(previousMaster ? [previousMaster] : [])]).catch(() => {});
  }

  return { avatar, avatarPath };
}

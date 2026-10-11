import { supabase } from './supabase';
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
export async function readAccount(): Promise<RiderAccount | null> {
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!session.session) return null;
  const { data, error } = await supabase.from('profiles').select('id,full_name,phone,avatar_path').eq('id', session.session.user.id).single();
  if (error || !data || data.id !== session.session.user.id) throw error || Error('Profile unavailable');
  let avatar: string | null = null;
  if (typeof data.avatar_path === 'string' && data.avatar_path) {
    if (data.avatar_path.startsWith('https://')) avatar = data.avatar_path;
    else { const signed = await supabase.storage.from('profile-photos').createSignedUrl(data.avatar_path, 3600); avatar = signed.data?.signedUrl || null; }
  }
  return { id: data.id, profile: { name: data.full_name || '', phone: data.phone || '', email: session.session.user.email || '' }, avatar, avatarPath: typeof data.avatar_path === 'string' ? data.avatar_path : null };
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
  return { name: data.full_name || '', phone: data.phone || '', email: auth.data.user.email || '' };
}

/** Rider portraits are immediately effective on the account owner's profile.
 * Driver portraits keep their separate verification and approval flow.
 */
export const RIDER_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const RIDER_AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function riderAvatarValidation(file: Pick<File, 'size' | 'type'>): 'type' | 'size' | null {
  if (!(file.type in RIDER_AVATAR_EXTENSIONS)) return 'type';
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > RIDER_AVATAR_MAX_BYTES) return 'size';
  return null;
}

export async function uploadRiderAvatar(
  account: RiderAccount,
  file: File,
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
    cacheControl: '3600',
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  const updated = await supabase.from('profiles')
    .update({ avatar_path: path })
    .eq('id', account.id)
    .select('avatar_path')
    .single();

  if (updated.error || updated.data?.avatar_path !== path) {
    // Best-effort cleanup; do not strand a visible photo when the profile
    // update was not committed successfully.
    await storage.remove([path]).catch(() => {});
    throw updated.error || new Error('avatar_save_failed');
  }

  const signed = await storage.createSignedUrl(path, 3600);
  // A successful profile update must never be reported as failed solely
  // because URL generation was temporarily unavailable.
  const avatar = signed.data?.signedUrl || null;

  if (account.avatarPath && !account.avatarPath.startsWith('https://') &&
      account.avatarPath.startsWith(`${account.id}/`) && account.avatarPath !== path) {
    void storage.remove([account.avatarPath]).catch(() => {});
  }

  return { avatar, avatarPath: path };
}

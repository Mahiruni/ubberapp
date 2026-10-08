import { supabase } from './supabase';
import type { PreviewProfile } from './nexride-preview';
export type RiderAccount = { id: string; profile: PreviewProfile; avatar: string | null };
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
    else { const signed = await supabase.storage.from('profile-photos').createSignedUrl(data.avatar_path, 300); avatar = signed.data?.signedUrl || null; }
  }
  return { id: data.id, profile: { name: data.full_name || '', phone: data.phone || '', email: session.session.user.email || '' }, avatar };
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

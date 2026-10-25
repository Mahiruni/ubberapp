import type { SupabaseClient } from '@supabase/supabase-js';
import { DRIVER_AVATAR_ACCOUNT_KEY } from './biloo-driver-map-avatar';

// Appearance only; no names, contacts, eligibility, GPS or trip data are cached.
const preferences = new Map<string, { until: number; metadata: Record<string, unknown> }>();
export async function driverAvatarMetadata(admin: SupabaseClient, driverId: string): Promise<Record<string, unknown>> {
  const cached = preferences.get(driverId);
  if (cached && cached.until > Date.now()) return cached.metadata;
  const { data, error } = await admin.auth.admin.getUserById(driverId).catch(() => ({ data: { user: null }, error: true }));
  if (error || !data.user) return {};
  const source = data.user.user_metadata || {};
  const metadata = { vehicle: source.vehicle, vehicle_body_type: source.vehicle_body_type, [DRIVER_AVATAR_ACCOUNT_KEY]: source[DRIVER_AVATAR_ACCOUNT_KEY] };
  if (preferences.size >= 512) preferences.delete(preferences.keys().next().value!);
  preferences.set(driverId, { until: Date.now() + 10_000, metadata });
  return metadata;
}
export function invalidateDriverAvatarMetadata(driverId: string) { preferences.delete(driverId); }

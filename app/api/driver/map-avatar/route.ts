import { authorizedRequestSupabase } from '../../../../lib/nexride-server-supabase';
import { serverAdminSupabase } from '../../../../lib/nexride-server-admin';
import { DRIVER_AVATAR_ACCOUNT_KEY, driverAvatarProfile, normalizeDriverAvatarStyle } from '../../../../lib/biloo-driver-map-avatar';
import { invalidateDriverAvatarMetadata } from '../../../../lib/biloo-driver-map-avatar-server';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function driverContext(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return { response: reply({ status: 'unauthorized' }, 401) };
  const admin = serverAdminSupabase();
  const [profile, driver] = await Promise.all([
    admin.from('profiles').select('role,account_status').eq('id', authorized.user.id).maybeSingle(),
    admin.from('drivers').select('vehicle,vehicle_color').eq('id', authorized.user.id).maybeSingle(),
  ]);
  if (profile.error || driver.error) return { response: reply({ status: 'unavailable' }, 503) };
  if (profile.data?.role !== 'driver' || profile.data.account_status !== 'active' || !driver.data) return { response: reply({ status: 'driver_required' }, 403) };
  return { authorized, admin, vehicle: { model: driver.data.vehicle, color: driver.data.vehicle_color } };
}

export async function GET(request: Request) {
  try {
    const context = await driverContext(request);
    if (context.response) return context.response;
    return reply({ status: 'ready', ...driverAvatarProfile(context.vehicle!, context.authorized!.user.user_metadata) });
  } catch { return reply({ status: 'unavailable' }, 503); }
}

export async function PATCH(request: Request) {
  try {
    const context = await driverContext(request);
    if (context.response) return context.response;
    let input: Record<string, unknown>;
    try { input = await request.json(); } catch { return reply({ status: 'invalid' }, 400); }
    // Clients select a livery only. Registered model/color/body cannot be overridden here.
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => key !== 'style')) return reply({ status: 'invalid' }, 400);
    const style = normalizeDriverAvatarStyle(input.style);
    if (!style) return reply({ status: 'invalid' }, 400);
    const current = driverAvatarProfile(context.vehicle!, context.authorized!.user.user_metadata);
    if (!current.complete) return reply({ status: 'vehicle_incomplete' }, 409);
    // Cosmetic account preferences use Auth metadata, as Rider avatars do.
    // This narrow patch is merged by GoTrue; it does not rewrite other profile fields.
    const { data, error } = await context.admin!.auth.admin.updateUserById(context.authorized!.user.id, {
      user_metadata: { [DRIVER_AVATAR_ACCOUNT_KEY]: { style } },
    });
    if (error || !data.user) return reply({ status: 'save_failed' }, 503);
    invalidateDriverAvatarMetadata(context.authorized!.user.id);
    return reply({ status: 'saved', ...driverAvatarProfile(context.vehicle!, { ...context.authorized!.user.user_metadata, ...data.user.user_metadata, [DRIVER_AVATAR_ACCOUNT_KEY]: { style } }) });
  } catch { return reply({ status: 'unavailable' }, 503); }
}

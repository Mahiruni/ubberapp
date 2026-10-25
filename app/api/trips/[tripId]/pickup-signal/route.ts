import { authorizedRequestSupabase } from '../../../../../lib/nexride-server-supabase';
import { serverAdminSupabase } from '../../../../../lib/nexride-server-admin';
import { DEFAULT_MAP_AVATAR, normalizeMapAvatar } from '../../../../../lib/biloo-rider-avatar-art';
import { freshPickupSignal, PICKUP_SIGNAL_COOLDOWN_MS, PICKUP_SIGNAL_MESSAGE } from '../../../../../lib/biloo-rider-motion';

type Context = { params: Promise<{ tripId: string }> };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function participant(request: Request, context: Context) {
  const { tripId } = await context.params;
  if (!uuid(tripId)) return { response: reply({ status: 'invalid' }, 400) };
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return { response: reply({ status: 'unauthorized' }, 401) };
  // RLS scopes the row; explicitly check ownership and current assignment too.
  const { data: ride, error } = await authorized.client.from('ride_requests')
    .select('id,rider_id,assigned_driver_id,status').eq('id', tripId).maybeSingle();
  if (error) return { response: reply({ status: 'unavailable' }, 503) };
  if (!ride || ![ride.rider_id, ride.assigned_driver_id].includes(authorized.user.id)) return { response: reply({ status: 'not_found' }, 404) };
  if (!ride.assigned_driver_id || !['accepted', 'arrived_pickup'].includes(ride.status)) return { response: reply({ status: 'inactive' }, 409) };
  return { authorized, ride, tripId };
}

type Participant = Extract<Awaited<ReturnType<typeof participant>>, { authorized: unknown }>;
async function latestSignal(scope: Participant, nonce?: string) {
  let query = scope.authorized.client.from('ride_chat_messages').select('id,created_at')
    .eq('ride_request_id', scope.tripId).eq('sender_id', scope.ride.rider_id).eq('body', PICKUP_SIGNAL_MESSAGE);
  if (nonce) query = query.eq('client_nonce', nonce);
  const result = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw result.error;
  return result.data && freshPickupSignal(result.data.created_at) ? { id: result.data.id, createdAt: result.data.created_at } : null;
}

export async function GET(request: Request, context: Context) {
  try {
    const scope = await participant(request, context);
    if ('response' in scope) return scope.response;
    const signal = await latestSignal(scope);
    // Only cosmetic fields are projected. No profile, contact, or device GPS is exposed.
    const admin = serverAdminSupabase();
    const { data, error } = await admin.from('rider_map_avatars').select('design').eq('user_id', scope.ride.rider_id).maybeSingle();
    let design: unknown = data?.design;
    if (error && !['PGRST205', '42P01'].includes(error.code)) return reply({ status: 'unavailable' }, 503);
    if (!design) {
      const user = await admin.auth.admin.getUserById(scope.ride.rider_id);
      if (user.error) return reply({ status: 'unavailable' }, 503);
      design = user.data.user?.user_metadata?.biloo_rider_map_avatar;
    }
    return reply({ status: 'ready', avatar: normalizeMapAvatar(design || DEFAULT_MAP_AVATAR), signal });
  } catch { return reply({ status: 'unavailable' }, 503); }
}

export async function POST(request: Request, context: Context) {
  try {
    const scope = await participant(request, context);
    if ('response' in scope) return scope.response;
    if (scope.authorized.user.id !== scope.ride.rider_id) return reply({ status: 'forbidden' }, 403);
    const body = await request.json().catch(() => null);
    if (!uuid(body?.nonce)) return reply({ status: 'invalid' }, 400);
    const existing = await latestSignal(scope);
    if (existing && Date.now() - Date.parse(existing.createdAt) < PICKUP_SIGNAL_COOLDOWN_MS) return reply({ status: 'ready', signal: existing });
    // The existing chat RLS rechecks the live trip on INSERT. The database sets
    // sender_id and created_at; callers cannot forge another rider or timestamp.
    const result = await scope.authorized.client.from('ride_chat_messages')
      .insert({ ride_request_id: scope.tripId, body: PICKUP_SIGNAL_MESSAGE, client_nonce: body.nonce })
      .select('id,created_at').single();
    if (result.error?.code === '23505') {
      const signal = await latestSignal(scope, body.nonce);
      return signal ? reply({ status: 'ready', signal }) : reply({ status: 'expired' }, 409);
    }
    if (result.error || !result.data) return reply({ status: 'send_failed' }, 503);
    return reply({ status: 'ready', signal: { id: result.data.id, createdAt: result.data.created_at } });
  } catch { return reply({ status: 'unavailable' }, 503); }
}

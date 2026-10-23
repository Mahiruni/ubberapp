import { authorizedRequestSupabase } from '../../../../../../lib/nexride-server-supabase';
import { routeBetween } from '../../../../../../lib/location';
import { freshDriverFix } from '../../../../../../lib/biloo-journey';
import { validPoint } from '../../../../../../lib/nexride-trip-data';

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

export async function GET(request: Request, context: { params: Promise<{ tripId: string }> }) {
  try {
    const authorized = await authorizedRequestSupabase(request);
    if (!authorized) return reply({ status: 'unauthorized' }, 401);
    const { tripId } = await context.params;
    const { data: ride, error } = await authorized.client.from('ride_requests')
      .select('id,status,assigned_driver_id,pickup_lat,pickup_lng,destination_lat,destination_lng')
      .eq('id', tripId).eq('rider_id', authorized.user.id).maybeSingle();
    if (error) return reply({ status: 'unavailable' }, 503);
    if (!ride) return reply({ status: 'not_found' }, 404);
    if (!['accepted', 'in_trip'].includes(ride.status) || !ride.assigned_driver_id)
      return reply({ status: 'inactive' }, 409);
    const target = ride.status === 'accepted' ? 'pickup' : 'destination';
    const { data: fix, error: fixError } = await authorized.client.from('ride_driver_locations')
      .select('latitude,longitude,recorded_at')
      .eq('ride_request_id', tripId).eq('driver_id', ride.assigned_driver_id).maybeSingle();
    const fixAt = Date.parse(fix?.recorded_at || '');
    if (fixError || !fix || !freshDriverFix(fixAt)) return reply({ status: 'tracking_stale' }, 409);
    const start = { lat: fix.latitude, lng: fix.longitude };
    const endpoint = target === 'pickup'
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
      : { lat: ride.destination_lat, lng: ride.destination_lng };
    if (!validPoint(start) || !validPoint(endpoint)) return reply({ status: 'route_unavailable' }, 422);
    const route = await routeBetween([start, endpoint], {
      profile: 'driving-traffic', requireProvider: true, signal: AbortSignal.timeout(8000),
    });
    if (route.provider !== 'mapbox' || !route.geometry?.length)
      return reply({ status: 'route_unavailable' }, 502);
    // Recheck stage/assignment after the provider round-trip. Never publish an
    // old Driver's route after cancellation, reassignment or trip completion.
    const { data: current, error: currentError } = await authorized.client.from('ride_requests')
      .select('status,assigned_driver_id').eq('id', tripId)
      .eq('rider_id', authorized.user.id).maybeSingle();
    if (currentError || !current || current.status !== ride.status ||
      current.assigned_driver_id !== ride.assigned_driver_id || !freshDriverFix(fixAt))
      return reply({ status: 'stale_stage' }, 409);
    return reply({ status: 'ready', route: {
      tripId, driverId: ride.assigned_driver_id, target, fixAt,
      points: route.geometry.map(([lat, lng]) => ({ lat, lng })),
      distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds,
      generatedAt: Date.now(),
    } });
  } catch { return reply({ status: 'route_unavailable' }, 503); }
}

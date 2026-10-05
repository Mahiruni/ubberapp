import { supabase } from './supabase';
import { normalizeTrip, textValue, type Row, type TripSnapshot } from './nexride-trip-data';
const activeStates = ['requested', 'accepted', 'arriving', 'in_progress'];
export async function riderTripList(userId: string) {
  const { data, error } = await supabase.from('trips').select('id,state,pickup_address,destination_address,total_minor,currency,requested_at')
    .eq('customer_id', userId).is('deleted_at', null).order('requested_at', { ascending: false }).limit(30);
  if (error) throw error;
  return (data || []) as Row[];
}
export const isActiveTrip = (row: Row) => activeStates.includes(String(row.state));
export async function readRiderTrip(tripId: string, userId: string, revision: number): Promise<TripSnapshot> {
  const { data: trip, error } = await supabase.from('trips').select('*').eq('id', tripId).eq('customer_id', userId).is('deleted_at', null).single();
  if (error || !trip) throw error || Error('Trip unavailable');
  const driverId = textValue(trip.driver_id);
  const [profile, driver, vehicle, locations, payment, rating, update] = await Promise.all([
    driverId ? supabase.from('profiles').select('id,full_name,phone,avatar_path').eq('id', driverId).maybeSingle() : null,
    driverId ? supabase.from('drivers').select('id,rating,review_status').eq('id', driverId).is('deleted_at', null).maybeSingle() : null,
    // Select the trip's assigned vehicle whenever the schema supplies its ID.
    driverId ? (() => { const query = supabase.from('vehicles').select('id,driver_id,make,model,color,plate_number').is('deleted_at', null); return trip.vehicle_id ? query.eq('id', trip.vehicle_id).eq('driver_id', driverId).maybeSingle() : query.eq('driver_id', driverId).limit(2); })() : null,
    driverId ? supabase.from('ride_locations').select('actor_id,location,accuracy_m,recorded_at').eq('trip_id', tripId).eq('actor_id', driverId).is('deleted_at', null).order('recorded_at', { ascending: false }).limit(1).maybeSingle() : null,
    supabase.from('payments').select('status,provider').eq('trip_id', tripId).eq('customer_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('ratings').select('score').eq('trip_id', tripId).eq('rater_id', userId).is('deleted_at', null).maybeSingle(),
    supabase.from('ride_events').select('metadata,created_at,event_type').eq('trip_id', tripId).in('event_type', ['tracking_update','route_update','eta_update']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  let location: Row | null | undefined = locations?.error ? null : locations?.data;
  const vehicles = vehicle?.data;
  const assignedVehicle = Array.isArray(vehicles) ? (vehicles.length === 1 ? vehicles[0] : null) : vehicles;
  if (!location && driverId && activeStates.includes(trip.state)) {
    const fix = await supabase.from('driver_locations').select('driver_id,location,accuracy_m,updated_at').eq('driver_id', driverId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!fix.error) location = fix.data;
  }
  let photo: string | undefined;
  const avatar = profile?.data?.avatar_path;
  if (typeof avatar === 'string' && avatar.trim()) {
    if (avatar.startsWith('https://')) photo = avatar;
    else { const signed = await supabase.storage.from('profile-photos').createSignedUrl(avatar, 60); if (!signed.error) photo = signed.data?.signedUrl; }
  }
  // Assignment/status can change during the fan-out. Do not publish a mixed snapshot.
  const latest = await supabase.from('trips').select('driver_id,state,updated_at').eq('id', tripId).eq('customer_id', userId).is('deleted_at', null).single();
  if (latest.error || latest.data.driver_id !== trip.driver_id || latest.data.state !== trip.state || latest.data.updated_at !== trip.updated_at) throw Error('Trip changed; refreshing');
  return normalizeTrip(trip, { profile: profile?.error ? null : { ...profile?.data, avatar_url: photo }, driver: driver?.error ? null : driver?.data,
    vehicle: vehicle?.error ? null : assignedVehicle, location, payment: payment.error ? null : payment.data, rating: rating.error ? null : rating.data, update: update.error ? null : update.data }, revision);
}
export async function submitRiderRating(input: { tripId: string; score: number; tags: string[]; feedback: string }) {
  const user = await supabase.auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to rate');
  if (!Number.isInteger(input.score) || input.score < 1 || input.score > 5 || typeof input.feedback !== 'string' || input.feedback.length > 1000 || !Array.isArray(input.tags) || input.tags.some(t => !['friendly','clean','smooth','on_time'].includes(t))) throw Error('Invalid feedback');
  const existing = await supabase.from('ratings').select('score').eq('trip_id', input.tripId).eq('rater_id', user.data.user.id).is('deleted_at', null).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return { tripId: input.tripId, status: 'already_rated', rating: { status: 'submitted', score: existing.data.score } };
  const comment = [input.tags.length ? `Feedback tags: ${input.tags.join(', ')}` : '', input.feedback.trim()].filter(Boolean).join('\n');
  const result = await supabase.rpc('submit_trip_rating', { p_trip_id: input.tripId, p_score: input.score, p_comment: comment || null });
  if (result.error || !result.data || result.data.trip_id !== input.tripId || result.data.rater_id !== user.data.user.id) throw result.error || Error('Rating not confirmed');
  return { tripId: input.tripId, status: result.data.score === input.score ? 'accepted' : 'already_rated', rating: { status: 'submitted', score: result.data.score } };
}
export async function sendTripMessage(input: { bookingId: string; driverId: string; text: string }) {
  const user = await supabase.auth.getUser(); if (user.error || !user.data.user) throw Error('Sign in to chat');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) throw Error('Invalid message');
  const trip = await supabase.from('trips').select('id,driver_id,state').eq('id', input.bookingId).eq('customer_id', user.data.user.id).is('deleted_at', null).single();
  if (trip.error || trip.data.driver_id !== input.driverId || !['accepted','arriving','in_progress'].includes(trip.data.state)) throw Error('Driver assignment changed');
  const result = await supabase.from('chat_messages').insert({ trip_id: input.bookingId, sender_id: user.data.user.id, body: input.text.trim(), message_type: 'text' }).select('id').single();
  if (result.error || !result.data?.id) throw result.error || Error('Message not accepted');
  return { status: 'sent' };
}

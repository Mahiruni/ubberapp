import { supabase } from './supabase';
import { nexrideApiFetch } from './nexride-api-auth';
import { textValue, timestamp, type Row, type TripSnapshot } from './nexride-trip-data';

const activeStates = ['accepted', 'arrived_pickup', 'in_trip'];

const numeric = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const point = (lat: unknown, lng: unknown) => {
  const a = numeric(lat), b = numeric(lng);
  return a != null && b != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : {};
};

export async function riderTripList(userId: string) {
  const { data, error } = await supabase
    .from('ride_requests')
    .select('id,status,pickup_location,destination_location,ride_category,estimated_trip_fare_etb,final_fare_etb,payment_method,payment_status,created_at,completed_at,cancelled_at')
    .eq('rider_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    state: row.status,
    pickup_address: row.pickup_location,
    destination_address: row.destination_location,
    service_type: row.ride_category,
    total_minor: numeric(row.final_fare_etb ?? row.estimated_trip_fare_etb) != null
      ? Math.round((numeric(row.final_fare_etb ?? row.estimated_trip_fare_etb) || 0) * 100)
      : null,
    currency: 'ETB',
    requested_at: row.created_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    payment_method: row.payment_method,
    payment_status: row.payment_status,
  })) as Row[];
}

export const isActiveTrip = (row: Row) => activeStates.includes(String(row.state));

function riderStatus(value: unknown): TripSnapshot['status'] {
  if (value === 'accepted') return 'approaching';
  if (value === 'arrived_pickup') return 'arrived';
  if (value === 'in_trip') return 'in_trip';
  if (value === 'completed') return 'completed';
  if (value === 'cancelled' || value === 'withdrawn') return 'cancelled';
  return 'reassigning';
}

export async function readRiderTrip(
  tripId: string,
  userId: string,
  revision: number,
): Promise<TripSnapshot> {
  const { data: ride, error } = await supabase
    .from('ride_requests')
    .select('id,rider_id,assigned_driver_id,pickup_location,destination_location,pickup_lat,pickup_lng,destination_lat,destination_lng,ride_category,estimated_trip_fare_etb,final_fare_etb,payment_method,payment_status,status,created_at,updated_at,completed_at,estimated_trip_duration_minutes,estimated_trip_distance_km')
    .eq('id', tripId)
    .eq('rider_id', userId)
    .single();

  if (error || !ride) throw error || Error('Trip unavailable');

  const driverId = textValue(ride.assigned_driver_id);
  const active = activeStates.includes(String(ride.status));

  const [driverSafeResult, ratingResult, locationResult] = await Promise.all([
    driverId
      ? nexrideApiFetch(`/api/rider/trips/${tripId}/driver`, {
          cache: 'no-store',
        })
          .then(async (response) =>
            response.ok ? await response.json() : null,
          )
          .catch(() => null)
      : null,
    supabase.from('ride_ratings').select('score').eq('ride_request_id', tripId).eq('rater_id', userId).maybeSingle(),
    driverId && active
      ? supabase
          .from('ride_driver_locations')
          .select('driver_id,latitude,longitude,accuracy_meters,heading_degrees,recorded_at')
          .eq('ride_request_id', tripId)
          .eq('driver_id', driverId)
          .maybeSingle()
      : null,
  ]);

  const safeDriver =
    driverSafeResult?.status === 'ready' && driverSafeResult?.driver
      ? driverSafeResult.driver
      : null;
  const rating = !ratingResult.error ? ratingResult.data : null;
  const location = locationResult && !locationResult.error ? locationResult.data : null;

  const estimatedFare = numeric(ride.estimated_trip_fare_etb);
  const finalFare = numeric(ride.final_fare_etb);
  const score = numeric(rating?.score);

  const snapshot: TripSnapshot = {
    id: ride.id,
    revision,
    status: riderStatus(ride.status),
    category: textValue(ride.ride_category),
    driver:
      driverId &&
      safeDriver &&
      !['reassigning', 'cancelled'].includes(riderStatus(ride.status))
        ? {
            id: driverId,
            name: textValue(safeDriver.name),
            photo: textValue(safeDriver.photo),
            contactPhone: active ? textValue(safeDriver.phone) : undefined,
            rating: numeric(safeDriver.rating),
            tripCount: numeric(safeDriver.tripCount),
            vehicle: {
              model: textValue(safeDriver.vehicle?.model),
              color: textValue(safeDriver.vehicle?.color),
              plate: textValue(safeDriver.vehicle?.plate),
            },
            verification:
              safeDriver.verification?.status === 'verified' &&
              numeric(safeDriver.verification?.verifiedAt) != null
                ? {
                    status: 'verified',
                    source:
                      textValue(safeDriver.verification?.source) ||
                      'driver_review',
                    verifiedAt: numeric(
                      safeDriver.verification?.verifiedAt,
                    )!,
                  }
                : undefined,
          }
        : null,
    pickup: {
      ...point(ride.pickup_lat, ride.pickup_lng),
      name: textValue(ride.pickup_location),
    },
    destination: {
      ...point(ride.destination_lat, ride.destination_lng),
      name: textValue(ride.destination_location),
    },
    tracking:
      location &&
      driverId &&
      numeric(location.latitude) != null &&
      numeric(location.longitude) != null &&
      timestamp(location.recorded_at) != null
        ? {
            driverId,
            lat: numeric(location.latitude)!,
            lng: numeric(location.longitude)!,
            updatedAt: timestamp(location.recorded_at)!,
            accuracyMeters: numeric(location.accuracy_meters),
          }
        : null,
    fare: estimatedFare != null ? { amount: estimatedFare, currency: 'ETB' } : undefined,
    finalAmount:
      ride.status === 'completed' && finalFare != null
        ? { amount: finalFare, currency: 'ETB' }
        : undefined,
    completedAt: timestamp(ride.completed_at),
    payment: {
      status:
        ride.payment_status === 'paid'
          ? 'paid'
          : ride.payment_status === 'pending'
            ? 'pending'
            : ride.payment_status === 'failed'
              ? 'failed'
              : 'unknown',
      method: ride.payment_method === 'cash' ? 'Cash' : undefined,
    },
    rating:
      score != null && Number.isInteger(score) && score >= 1 && score <= 5
        ? { status: 'submitted', score }
        : undefined,
  };

  return snapshot;
}

export async function submitRiderRating(input: {
  tripId: string;
  score: number;
  tags: string[];
  feedback: string;
}) {
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) throw Error('Sign in to rate');

  if (
    !Number.isInteger(input.score) ||
    input.score < 1 ||
    input.score > 5 ||
    typeof input.feedback !== 'string' ||
    input.feedback.length > 1000 ||
    !Array.isArray(input.tags) ||
    input.tags.some((tag) => !['friendly', 'clean', 'smooth', 'on_time'].includes(tag))
  ) throw Error('Invalid feedback');

  const existing = await supabase
    .from('ride_ratings')
    .select('score')
    .eq('ride_request_id', input.tripId)
    .eq('rater_id', user.data.user.id)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) {
    return {
      tripId: input.tripId,
      status: 'already_rated',
      rating: { status: 'submitted', score: existing.data.score },
    };
  }

  const comment = [
    input.tags.length ? 'Feedback tags: ' + input.tags.join(', ') : '',
    input.feedback.trim(),
  ].filter(Boolean).join('\n');

  const result = await supabase
    .from('ride_ratings')
    .insert({
      ride_request_id: input.tripId,
      score: input.score,
      feedback: comment || null,
    })
    .select('score')
    .single();

  if (result.error || !result.data) throw result.error || Error('Rating not confirmed');

  return {
    tripId: input.tripId,
    status: 'accepted',
    rating: { status: 'submitted', score: result.data.score },
  };
}

export async function sendTripMessage(input: {
  bookingId: string;
  driverId: string;
  text: string;
}) {
  const user = await supabase.auth.getUser();
  if (user.error || !user.data.user) throw Error('Sign in to chat');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 2000) {
    throw Error('Invalid message');
  }

  const ride = await supabase
    .from('ride_requests')
    .select('id,assigned_driver_id,status')
    .eq('id', input.bookingId)
    .eq('rider_id', user.data.user.id)
    .single();

  if (
    ride.error ||
    ride.data.assigned_driver_id !== input.driverId ||
    !activeStates.includes(String(ride.data.status))
  ) throw Error('Driver assignment changed');

  const result = await supabase
    .from('ride_chat_messages')
    .insert({
      ride_request_id: input.bookingId,
      body: input.text.trim(),
      client_nonce: crypto.randomUUID(),
    })
    .select('id')
    .single();

  if (result.error || !result.data?.id) throw result.error || Error('Message not accepted');
  return { status: 'sent' };
}

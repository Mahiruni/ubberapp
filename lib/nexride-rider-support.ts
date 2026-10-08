import { supabase } from "./supabase";

export type RiderRideStatus =
  | "pending"
  | "accepted"
  | "arrived_pickup"
  | "in_trip"
  | "withdrawn"
  | "cancelled"
  | "completed";

export type RiderRide = {
  id: string;
  riderId: string | null;
  driverId: string | null;
  pickup: string;
  destination: string;
  category: string;
  status: RiderRideStatus;
  estimatedFareEtb: number | null;
  finalFareEtb: number | null;
  paymentMethod: "cash" | "chapa" | "unknown";
  paymentStatus: "pending" | "paid" | "failed" | "unknown";
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

export type RideRating = {
  score: number;
  feedback: string;
};

export type RideMessage = {
  id: string;
  rideRequestId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

const number = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function status(value: unknown): RiderRideStatus {
  return value === "accepted" ||
    value === "arrived_pickup" ||
    value === "in_trip" ||
    value === "withdrawn" ||
    value === "cancelled" ||
    value === "completed"
    ? value
    : "pending";
}

function mapRide(row: Record<string, unknown>): RiderRide {
  return {
    id: String(row.id || ""),
    riderId: typeof row.rider_id === "string" ? row.rider_id : null,
    driverId: typeof row.assigned_driver_id === "string" ? row.assigned_driver_id : null,
    pickup: typeof row.pickup_location === "string" ? row.pickup_location : "Pickup unavailable",
    destination: typeof row.destination_location === "string" ? row.destination_location : "Destination unavailable",
    category: typeof row.ride_category === "string" ? row.ride_category : "Ride",
    status: status(row.status),
    estimatedFareEtb: number(row.estimated_trip_fare_etb),
    finalFareEtb: number(row.final_fare_etb),
    paymentMethod: row.payment_method === "cash" || row.payment_method === "chapa" ? row.payment_method : "unknown",
    paymentStatus:
      row.payment_status === "paid" || row.payment_status === "failed" || row.payment_status === "unknown"
        ? row.payment_status
        : "pending",
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
    completedAt: typeof row.completed_at === "string" ? row.completed_at : null,
    cancelledAt: typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancellationReason: typeof row.cancellation_reason === "string" ? row.cancellation_reason : null,
  };
}

const rideSelect =
  "id,rider_id,assigned_driver_id,pickup_location,destination_location,ride_category,status,estimated_trip_fare_etb,final_fare_etb,payment_method,payment_status,created_at,completed_at,cancelled_at,cancellation_reason";

export async function loadRiderRideHistory(userId: string) {
  const { data, error } = await supabase
    .from("ride_requests")
    .select(rideSelect)
    .eq("rider_id", userId)
    .in("status", ["completed", "cancelled", "withdrawn"])
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data || []).map((row) => mapRide(row as Record<string, unknown>));
}

export async function loadRiderRide(rideId: string, userId: string) {
  const { data, error } = await supabase
    .from("ride_requests")
    .select(rideSelect)
    .eq("id", rideId)
    .eq("rider_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapRide(data as Record<string, unknown>) : null;
}

export async function loadParticipantRide(rideId: string, userId: string) {
  const { data, error } = await supabase
    .from("ride_requests")
    .select(rideSelect)
    .eq("id", rideId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const ride = mapRide(data as Record<string, unknown>);
  if (ride.riderId !== userId && ride.driverId !== userId) return null;
  return ride;
}

export async function loadRideRating(rideId: string, userId: string): Promise<RideRating | null> {
  const { data, error } = await supabase
    .from("ride_ratings")
    .select("score,feedback")
    .eq("ride_request_id", rideId)
    .eq("rater_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? { score: data.score, feedback: data.feedback || "" } : null;
}

export async function loadRideMessages(rideId: string): Promise<RideMessage[]> {
  const { data, error } = await supabase
    .from("ride_chat_messages")
    .select("id,ride_request_id,sender_id,body,created_at")
    .eq("ride_request_id", rideId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    rideRequestId: row.ride_request_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  }));
}

export function rideAmount(ride: RiderRide) {
  return {
    amount: ride.finalFareEtb ?? ride.estimatedFareEtb,
    final: ride.finalFareEtb !== null,
  };
}

export function formatRideStatus(value: RiderRideStatus) {
  if (value === "arrived_pickup") return "Arrived at pickup";
  if (value === "in_trip") return "In trip";
  if (value === "withdrawn") return "Withdrawn";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function rideDate(ride: RiderRide) {
  return ride.completedAt || ride.cancelledAt || ride.createdAt;
}

export function isRideChatActive(ride: RiderRide) {
  return ride.status === "accepted" || ride.status === "arrived_pickup" || ride.status === "in_trip";
}

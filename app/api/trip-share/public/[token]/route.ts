import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import {
 activeTripStatuses,hashTripShareToken,tripShareToken,
 tripShareLocation,safeTripShareText,
} from "../../../../../lib/nexride-trip-sharing";

type Context={params:Promise<{token:string}>};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{
 "Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer",
 "X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow, noarchive",
 "Access-Control-Allow-Origin":"null",
}});
export async function GET(_request:Request,context:Context) {
 const {token}=await context.params;
 if(!tripShareToken.test(token))return reply({status:"not_found"},404);
 try {
  const admin=serverAdminSupabase();
  const {data:share,error:shareError}=await admin.from("nexride_trip_share_links")
    .select("trip_id,expires_at,revoked_at,creator_role")
    .eq("token_hash",hashTripShareToken(token)).maybeSingle();
  if(shareError)return reply({status:"unavailable"},503);
  if(!share)return reply({status:"not_found"},404);
  if(share.revoked_at||Date.parse(share.expires_at)<=Date.now())
    return reply({status:"ended"},410);
  const {data:trip,error:tripError}=await admin.from("ride_requests")
    .select("id,status,assigned_driver_id,pickup_location,destination_location,ride_category")
    .eq("id",share.trip_id).maybeSingle();
  if(tripError)return reply({status:"unavailable"},503);
  if(!trip||!activeTripStatuses.has(trip.status)||!trip.assigned_driver_id)
    return reply({status:"ended"},410);
  const {data:location,error:locationError}=await admin.from("ride_driver_locations")
    .select("latitude,longitude,accuracy_meters,recorded_at")
    .eq("ride_request_id",trip.id).eq("driver_id",trip.assigned_driver_id)
    .maybeSingle();
  if(locationError)return reply({status:"unavailable"},503);
  return reply({
    status:"active",
    trip:{
      stage:trip.status,
      pickup:safeTripShareText(trip.pickup_location),
      destination:safeTripShareText(trip.destination_location),
      category:safeTripShareText(trip.ride_category,40),
    },
    driverLocation:tripShareLocation(location),
    expiresAt:share.expires_at,
    lastCheckedAt:new Date().toISOString(),
  });
 }catch{return reply({status:"unavailable"},503);}
}

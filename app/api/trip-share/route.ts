import { authorizedRequestSupabase } from "../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../lib/nexride-server-admin";
import { publicConfig } from "../../../lib/runtime-config";
import {
  activeTripStatuses,allowedTripShare,newTripShareCapability,
  tripShareDurationMinutes,tripShareUuid,
} from "../../../lib/nexride-trip-sharing";

const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{
  "Cache-Control":"no-store, max-age=0","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
}});

async function verifiedTrip(tripId:string) {
  const {data,error}=await serverAdminSupabase().from("ride_requests")
    .select("id,rider_id,assigned_driver_id,status").eq("id",tripId).maybeSingle();
  if(error)throw new Error("trip_lookup_failed");
  return data;
}

/** Create a private 15/30/60-minute link only for verified trip participants. */
export async function POST(request:Request) {
  const actor=await authorizedRequestSupabase(request);
  if(!actor)return response({status:"unauthorized"},401);
  const body=await request.json().catch(()=>null) as
    {tripId?:unknown;role?:unknown;minutes?:unknown}|null;
  const tripId=typeof body?.tripId==="string"?body.tripId:"";
  const role=body?.role==="rider"||body?.role==="driver"?body.role:null;
  if(!tripShareUuid.test(tripId)||!role)return response({status:"invalid_request"},400);
  try {
    const admin=serverAdminSupabase();
    const trip=await verifiedTrip(tripId);
    if(!trip||!allowedTripShare(actor.user.id,role,trip))return response({status:"not_active_or_unauthorized"},403);
    // Bound issuance to stop accidental share-spam and token leakage.
    const fiveMinutesAgo=new Date(Date.now()-5*60_000).toISOString();
    const {count,error:limitError}=await admin.from("nexride_trip_share_links")
      .select("id",{count:"exact",head:true})
      .eq("created_by",actor.user.id).gte("created_at",fiveMinutesAgo);
    if(limitError)return response({status:"unavailable"},503);
    if((count??0)>=5)return response({status:"rate_limited"},429);

    const {token,hash}=newTripShareCapability();
    const minutes=tripShareDurationMinutes(body?.minutes);
    const {data,error}=await admin.from("nexride_trip_share_links").insert({
      trip_id:tripId,created_by:actor.user.id,creator_role:role,
      token_hash:hash,expires_at:new Date(Date.now()+minutes*60_000).toISOString(),
    }).select("id,expires_at").single();
    if(error||!data)return response({status:"unavailable"},503);
    // Use the canonical NexRide host, never untrusted Host/X-Forwarded headers.
    const url=new URL("/share/trip/"+token,publicConfig.appUrl).toString();
    return response({status:"ready",id:data.id,url,expiresAt:data.expires_at});
  } catch{return response({status:"unavailable"},503);}
}

/** List this signed-in account's own active/revoked links, NEVER the tokens. */
export async function GET(request:Request) {
  const actor=await authorizedRequestSupabase(request);
  if(!actor)return response({status:"unauthorized"},401);
  const tripId=new URL(request.url).searchParams.get("tripId")||"";
  if(!tripShareUuid.test(tripId))return response({status:"invalid_request"},400);
  try {
    const trip=await verifiedTrip(tripId);
    if(!trip || (trip.rider_id!==actor.user.id && trip.assigned_driver_id!==actor.user.id))
      return response({status:"not_found"},404);
    const {data,error}=await serverAdminSupabase().from("nexride_trip_share_links")
      .select("id,created_at,expires_at,revoked_at")
      .eq("trip_id",tripId).eq("created_by",actor.user.id)
      .order("created_at",{ascending:false}).limit(10);
    if(error)return response({status:"unavailable"},503);
    return response({status:"ready",links:data??[]});
  } catch{return response({status:"unavailable"},503);}
}

/** Revocation requires authenticated creator; arbitrary trip actors cannot revoke others' links. */
export async function DELETE(request:Request) {
  const actor=await authorizedRequestSupabase(request);
  if(!actor)return response({status:"unauthorized"},401);
  const body=await request.json().catch(()=>null) as {id?:unknown}|null;
  const id=typeof body?.id==="string"?body.id:"";
  if(!tripShareUuid.test(id))return response({status:"invalid_request"},400);
  try {
    const {data,error}=await serverAdminSupabase().from("nexride_trip_share_links")
      .update({revoked_at:new Date().toISOString()})
      .eq("id",id).eq("created_by",actor.user.id).is("revoked_at",null)
      .select("id").maybeSingle();
    if(error)return response({status:"unavailable"},503);
    return response({status:data?"revoked":"not_found"},data?200:404);
  } catch{return response({status:"unavailable"},503);}
}

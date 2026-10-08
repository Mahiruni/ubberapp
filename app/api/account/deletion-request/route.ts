import { createClient } from "@supabase/supabase-js";
import { authorizedRequestSupabase } from "../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";
import { publicConfig } from "../../../../lib/runtime-config";

const respond = (status: string, code = 200) =>
  Response.json({status}, {status:code,headers:{"Cache-Control":"no-store"}});

/**
 * Authenticated account-deletion REVIEW request. Password is verified
 * exclusively server-side and never logged, stored or sent to PostgreSQL.
 * This endpoint cannot delete an account or release identity claims.
 */
export async function POST(request: Request) {
  const authorized = await authorizedRequestSupabase(request);
  if (!authorized) return respond("unauthorized",401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return respond("invalid_request",400); }
  const raw = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  const password = raw.password;
  if (raw.confirm !== true || typeof password !== "string" ||
      password.length < 6 || password.length > 512) {
    return respond("confirmation_required",400);
  }
  const owner=authorized.user;
  if (!owner.email) return respond("password_reauthentication_unavailable",409);

  try {
    // Ephemeral public Auth client. This does not replace the current user's
    // browser session and cannot sign out another device.
    const verifier=createClient(publicConfig.supabaseUrl,publicConfig.supabaseKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    });
    const auth=await verifier.auth.signInWithPassword({email:owner.email,password});
    if(auth.error || auth.data.user?.id!==owner.id) {
      return respond("reauthentication_failed",401);
    }

    const admin=serverAdminSupabase();
    const [profile,rides,payouts,existing] = await Promise.all([
      admin.from("profiles").select("id,account_status").eq("id",owner.id).maybeSingle(),
      admin.from("ride_requests").select("id")
        .or(`rider_id.eq.${owner.id},assigned_driver_id.eq.${owner.id}`)
        .in("status",["accepted","arrived_pickup","in_trip"]).limit(1),
      admin.from("driver_payout_requests").select("id")
        .eq("driver_id",owner.id).in("status",["pending","approved","processing"]).limit(1),
      admin.from("account_deletion_requests").select("id,status")
        .eq("user_id",owner.id).in("status",["pending","under_review","on_hold"])
        .limit(1).maybeSingle(),
    ]);
    if(profile.error || rides.error || payouts.error || existing.error) {
      return respond("account_review_unavailable",503);
    }
    if(!profile.data || profile.data.account_status!=="active") {
      return respond("account_inactive",403);
    }
    if(rides.data?.length || payouts.data?.length) return respond("outstanding_obligations",409);
    if(existing.data) return respond("already_requested",200);

    const inserted=await admin.from("account_deletion_requests")
      .insert({user_id:owner.id,status:"pending"}).select("id").single();
    if(inserted.error) {
      if(inserted.error.code==="23505") return respond("already_requested");
      if(inserted.error.code==="23514") return respond("outstanding_obligations",409);
      return respond("account_review_unavailable",503);
    }
    return respond("review_requested",201);
  } catch {
    return respond("account_review_unavailable",503);
  }
}

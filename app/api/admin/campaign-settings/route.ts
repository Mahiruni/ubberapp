import { NextRequest, NextResponse } from "next/server";
import { serverAdminSupabase } from "../../../../lib/nexride-server-admin";

export const dynamic = "force-dynamic";

async function admin(req: NextRequest) {
 const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
 if (!token) return null;
 const db = serverAdminSupabase();
 const { data, error } = await db.auth.getUser(token);
 if (error || !data.user) return null;
 const { data: profile } = await db.from("profiles").select("role,account_status").eq("id",data.user.id).maybeSingle();
 if (profile?.role !== "admin" || profile.account_status !== "active") return null;
 return { db, user: data.user };
}
export async function GET(req: NextRequest) {
 try {
  const auth = await admin(req);
  if (!auth) return NextResponse.json({error:"Forbidden"},{status:403});
  const { data, error } = await auth.db.from("nexride_campaign_settings").select("bulk_enabled,updated_at").eq("id",true).single();
  if (error) throw error;
  return NextResponse.json({bulkEnabled:data.bulk_enabled,updatedAt:data.updated_at,deliveryReady:false,message:"Bulk sending is locked until consent, suppression and queue-worker verification pass."},{headers:{"Cache-Control":"no-store"}});
 } catch { return NextResponse.json({error:"Campaign settings unavailable"},{status:503}); }
}
export async function POST(req: NextRequest) {
 try {
  const auth = await admin(req);
  if (!auth) return NextResponse.json({error:"Forbidden"},{status:403});
  const body = await req.json().catch(()=>null);
  if (typeof body?.enabled !== "boolean" || body?.confirm !== true) return NextResponse.json({error:"Explicit confirmation required"},{status:400});
  if (body.enabled) return NextResponse.json({error:"Enabling bulk sending is locked until verified recipient consent, unsubscribe and worker safeguards are active."},{status:409});
  const {data: current,error:readError}=await auth.db.from("nexride_campaign_settings").select("bulk_enabled").eq("id",true).single();
  if (readError) throw readError;
  const {error}=await auth.db.from("nexride_campaign_settings").update({bulk_enabled:false,updated_by:auth.user.id,updated_at:new Date().toISOString()}).eq("id",true);
  if(error) throw error;
  await auth.db.from("admin_action_log").insert({actor_id:auth.user.id,action:"campaign_bulk_disabled",entity_type:"campaign_settings",metadata:{previous_enabled:current.bulk_enabled,new_enabled:false}});
  return NextResponse.json({bulkEnabled:false,message:"Bulk messaging disabled."});
 } catch { return NextResponse.json({error:"Could not update campaign settings"},{status:503}); }
}

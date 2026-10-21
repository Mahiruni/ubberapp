import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { previewCommission, validateCommissionDraft } from "../../../../../lib/biloo-commission-engine";

const answer=(body:unknown,code=200)=>Response.json(body,{status:code,headers:{"Cache-Control":"no-store"}});
async function authenticate(request:Request) {
  const auth=await authorizedRequestSupabase(request);
  if(!auth)return null;
  const db=serverAdminSupabase();
  const {data:profile,error}=await db.from("profiles")
    .select("role,admin_role,account_status")
    .eq("id",auth.user.id).maybeSingle();
  if(error||profile?.role!=="admin"||profile.account_status!=="active")return null;
  return {db,actor:auth.user.id,superAdmin:profile.admin_role==="super_admin"};
}

export async function GET(request:Request) {
  try {
    const ctx=await authenticate(request);
    if(!ctx)return answer({status:"forbidden"},403);
    const [rules,audits,quotes]=await Promise.all([
      ctx.db.from("platform_commission_rules")
        .select("id,ride_category,commission_bps,fixed_fee_minor,discount_bps,incentive_minor,tax_bps,effective_from,state,note,created_by,approved_by,approved_at,created_at")
        .order("created_at",{ascending:false}).limit(100),
      ctx.db.from("commission_rule_audit_events")
        .select("id,rule_id,actor_id,event_type,created_at")
        .order("created_at",{ascending:false}).limit(50),
      ctx.db.from("commission_quote_snapshots")
        .select("id",{count:"exact",head:true}),
    ]);
    if(rules.error||audits.error||quotes.error)return answer({status:"data_unavailable"},503);
    return answer({
      status:"ready",canConfigure:ctx.superAdmin, rules:rules.data||[], audits:audits.data||[],
      quoteCount:quotes.count||0, mode:"informational_only",
      warning:"Approved rates create future-ride quotes only. No historical recalculation, ledger posting, payment or payout."
    });
  }catch{return answer({status:"unavailable"},503)}
}

export async function POST(request:Request){
  try{
    const ctx=await authenticate(request);
    if(!ctx)return answer({status:"forbidden"},403);
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
    if(!body||typeof body!=="object")return answer({status:"invalid_request"},400);
    const rule=validateCommissionDraft(body.rule);
    if(body.action==="preview"){
      const result=previewCommission(body.grossFareEtb,rule);
      return answer({status:"preview",calculation:result});
    }
    if(body.action!=="draft")return answer({status:"invalid_action"},400);
    if(!ctx.superAdmin)return answer({status:"requires_super_admin"},403);
    if(new Date(rule.effectiveFrom).getTime() < Date.now()+30000)
      return answer({status:"effective_date_must_be_in_future"},400);
    const {data,error}=await ctx.db.from("platform_commission_rules")
      .insert({
        ride_category:rule.rideCategory,commission_bps:rule.commissionBps,
        fixed_fee_minor:rule.fixedFeeMinor,discount_bps:rule.discountBps,
        incentive_minor:rule.incentiveMinor,tax_bps:rule.taxBps,
        effective_from:rule.effectiveFrom,note:rule.note,
        state:"draft",created_by:ctx.actor,
      })
      .select("id,state,effective_from").single();
    if(error)return answer({status:error.code==="23505"?"duplicate_effective_date":"rule_save_failed"},error.code==="23505"?409:503);
    return answer({status:"draft_created",rule:data},201);
  }catch(e){
    const msg=e instanceof Error?e.message:"INVALID_RULE";
    return answer({status:"invalid_request",reason:msg},400);
  }
}

export async function PATCH(request:Request){
  try{
    const ctx=await authenticate(request);
    if(!ctx)return answer({status:"forbidden"},403);
    if(!ctx.superAdmin)return answer({status:"requires_super_admin"},403);
    const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
    const id=body?.id;
    if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id)||body?.confirmation!=="APPROVE_FOR_FUTURE_QUOTES")
      return answer({status:"confirmation_required"},400);
    const {data:rule,error:readError}=await ctx.db.from("platform_commission_rules")
      .select("id,state,effective_from,tax_bps").eq("id",id).maybeSingle();
    if(readError||!rule)return answer({status:"not_found"},404);
    if(rule.state!=="draft")return answer({status:"already_final"},409);
    if(Number(rule.tax_bps)!==0)return answer({status:"tax_review_required"},409);
    if(Date.parse(rule.effective_from)<Date.now()+30000)
      return answer({status:"effective_date_passed"},409);
    const {data,error}=await ctx.db.from("platform_commission_rules")
      .update({state:"approved",approved_by:ctx.actor,approved_at:new Date().toISOString()})
      .eq("id",id).eq("state","draft")
      .select("id,state,approved_at").maybeSingle();
    if(error)return answer({status:"approval_failed"},503);
    if(!data)return answer({status:"approval_conflict"},409);
    return answer({status:"approved_for_future_quotes",rule:data});
  }catch{return answer({status:"unavailable"},503)}
}

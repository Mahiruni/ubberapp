import { authorizedRequestSupabase } from "../../../../../lib/nexride-server-supabase";
import { serverAdminSupabase } from "../../../../../lib/nexride-server-admin";
import { checkBalancedJournal } from "../../../../../lib/biloo-financial-ledger";

function response(data:unknown,status=200){
 return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
async function authorizedAdmin(request:Request){
 const auth=await authorizedRequestSupabase(request);
 if(!auth)return {status:401 as const};
 const db=serverAdminSupabase();
 const {data:profile,error}=await db.from("profiles")
  .select("role,admin_role,account_status").eq("id",auth.user.id).maybeSingle();
 if(error || profile?.role!=="admin" || profile.account_status!=="active")
  return {status:403 as const};
 return {status:200 as const,db,actor:auth.user.id,role:profile.admin_role};
}

/** Read-only trusted endpoint. No account balances are guessed from legacy ride fares. */
export async function GET(request:Request){
 try{
  const auth=await authorizedAdmin(request);
  if(auth.status!==200)return response({status:auth.status===401?"unauthorized":"forbidden"},auth.status);
  const db=auth.db!;
  const [accounts,journals,entries,runs,exceptions,audits,control,journalCount,exceptionCount]=await Promise.all([
   db.from("financial_accounts").select("code,name,account_class,currency,active").order("code"),
   db.from("financial_journals").select("id,source_key,source_type,description,currency,status,created_at")
    .order("created_at",{ascending:false}).limit(25),
   db.from("financial_ledger_entries").select("id,journal_id,account_code,side,amount_minor,currency,created_at")
    .order("created_at",{ascending:false}).limit(50),
   db.from("financial_reconciliation_runs")
    .select("id,provider,status,period_start,period_end,created_at")
    .order("created_at",{ascending:false}).limit(25),
   db.from("financial_reconciliation_exceptions")
    .select("id,source_kind,source_reference,exception_type,severity,status,created_at")
    .order("created_at",{ascending:false}).limit(50),
   db.from("financial_audit_events").select("id,event_type,journal_id,created_at")
    .order("created_at",{ascending:false}).limit(25),
   db.from("financial_posting_controls").select("posting_enabled").eq("singleton",true).maybeSingle(),
   db.from("financial_journals").select("id",{count:"exact",head:true}),
   db.from("financial_reconciliation_exceptions").select("id",{count:"exact",head:true})
    .eq("status","open"),
  ]);
  if([accounts,journals,entries,runs,exceptions,audits,control,journalCount,exceptionCount].some(x=>x.error))
    return response({status:"financial_sources_unavailable"},503);
  return response({status:"ready",currency:"ETB",postingEnabled:control.data?.posting_enabled===true,
    counts:{journals:journalCount.count??0,openExceptions:exceptionCount.count??0,
      reconciliationRuns:runs.data?.length??0},
    accounts:accounts.data??[],journals:journals.data??[],
    entries:entries.data??[],reconciliationRuns:runs.data??[],
    exceptions:exceptions.data??[],audit:audits.data??[],
    note:"Read-only financial foundation; no gateway, driver payout, or ledger posting enabled.",
    paginated:true});
 }catch{return response({status:"unavailable"},503)}
}

/** Preview-only accounting validation. No insert, wallet, settlement, or gateway call. */
export async function POST(request:Request){
 try{
  const auth=await authorizedAdmin(request);
  if(auth.status!==200)return response({status:auth.status===401?"unauthorized":"forbidden"},auth.status);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=="object"||Array.isArray(body)||(body as Record<string,unknown>).action!=="preview_balance")
    return response({status:"invalid_action"},400);
  const preview=checkBalancedJournal((body as Record<string,unknown>).lines);
  return response({status:"balanced_preview",...preview,
    note:"Illustrative only. No journal was posted and no financial balance has changed."});
 }catch(e){
  const reason=e instanceof Error?e.message:"invalid_journal";
  return response({status:"invalid_preview",reason},400);
 }
}

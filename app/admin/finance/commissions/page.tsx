"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../../components/nexride/ui";
import { nexrideApiFetch } from "../../../../lib/nexride-api-auth";
import "./commissions.css";

type CommissionRule = {
 id:string;ride_category:string;commission_bps:number;fixed_fee_minor:number;
 discount_bps:number;incentive_minor:number;tax_bps:number;
 effective_from:string;state:"draft"|"approved";note:string;
 approved_at:string|null;created_at:string;
};
type Audit = {id:string;rule_id:string;event_type:string;created_at:string};
type Calc = {
 grossEtb:string;commissionEtb:string;driverShareEtb:string;
 platformNetEtb:string;discountEtb:string;incentiveEtb:string;note:string;
};
type Snapshot = {status:string;canConfigure:boolean;rules:CommissionRule[];audits:Audit[];quoteCount:number};
const endpoint="/api/admin/finance/commissions";
function localTomorrow(){
 const d=new Date(Date.now()+86400000);
 const pad=(x:number)=>String(x).padStart(2,"0");
 return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function minor(value:string){const n=Number(value);return Number.isFinite(n)?Math.round(n*100):NaN;}
function etbMinor(n:number){return (n/100).toFixed(2);}
const categories=[["*","All ride categories"],["economy","Economy"],["comfort","Comfort"],["xl","XL"]];
function dateLabel(value:string){return new Date(value).toLocaleString("en-ET",{dateStyle:"medium",timeStyle:"short"});}

export default function CommissionManagement(){
 const [view,setView]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [form,setForm]=useState({
  rideCategory:"*",percent:"",fixedFee:"0.00",discount:"0",
  incentive:"0.00",effectiveFrom:localTomorrow(),note:"",
  tax:"0",
 });
 const [fare,setFare]=useState("300.00");
 const [calculation,setCalculation]=useState<Calc|null>(null);

 const load=useCallback(async()=>{
  const res=await nexrideApiFetch(endpoint,{cache:"no-store"});
  if(res.status===401||res.status===403)throw Error("Only authorized Biloo administrators can access Commission Management.");
  const body=await res.json().catch(()=>null) as Snapshot|null;
  if(!res.ok||body?.status!=="ready")throw Error("Commission settings are temporarily unavailable.");
  setView(body);
 },[]);
 useEffect(()=>{
  let alive=true;
  load().catch(e=>{if(alive)setError(e instanceof Error?e.message:"Unable to load commission rules.")})
    .finally(()=>{if(alive)setLoading(false)});
  return ()=>{alive=false};
 },[load]);

 const parsed=()=>{
  // Reject fractions below one cent or one basis point; never silently round
  // a financial policy field on behalf of its administrator.
  const twoDecimal=/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  if(![form.percent,form.fixedFee,form.discount,form.incentive,form.tax].every(v=>twoDecimal.test(v.trim())))
    throw Error("Use non-negative numbers with at most two decimal places.");
  const bps=Math.round(Number(form.percent)*100);
  const discount=Math.round(Number(form.discount)*100);
  const tax=Math.round(Number(form.tax)*100);
  const fixed=minor(form.fixedFee);
  const incentive=minor(form.incentive);
  if(!form.percent.trim()||![bps,discount,tax,fixed,incentive].every(Number.isSafeInteger))
    throw Error("Provide valid numbers with no more than two decimal places.");
  if(Number(form.percent)<0||Number(form.percent)>100||
     Number(form.discount)<0||Number(form.discount)>100||
     Number(form.tax)<0||Number(form.tax)>100||
     fixed<0||incentive<0)throw Error("Rates must be positive and percentages cannot exceed 100%.");
  if(!form.effectiveFrom||!Number.isFinite(new Date(form.effectiveFrom).getTime()))throw Error("Choose an effective date.");
  return {
   rideCategory:form.rideCategory,commissionBps:bps,
   fixedFeeMinor:fixed,discountBps:discount,
   incentiveMinor:incentive,taxBps:tax,
   effectiveFrom:new Date(form.effectiveFrom).toISOString(),note:form.note.trim(),
  };
 };
 async function request(action:"draft"|"preview"){
  setBusy(true);setError("");setNotice("");
  try{
   const rule=parsed();
   const res=await nexrideApiFetch(endpoint,{
    method:"POST",body:JSON.stringify({action,rule,grossFareEtb:fare}),
   });
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw Error(
     data?.status==="duplicate_effective_date"?"A rule for this category and effective date already exists.":
     data?.status==="effective_date_must_be_in_future"?"Set an effective date in the future.":
     data?.reason||"The commission action could not be completed."
   );
   if(action==="preview"){
     setCalculation(data.calculation as Calc);
     setNotice("Illustrative preview generated. No earnings or payment records changed.");
   }else{
     setCalculation(null);
     setNotice("Draft created. It cannot change earnings unless explicitly approved.");
     await load();
   }
  }catch(e){setError(e instanceof Error?e.message:"Unable to process commission action.")}
  finally{setBusy(false)}
 }
 async function approve(rule:CommissionRule){
  if(!view?.canConfigure||busy||rule.state!=="draft")return;
  if(!window.confirm("Approve this immutable rule for FUTURE ride calculation snapshots? No historical trips, payout balances or payments will change."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const res=await nexrideApiFetch(endpoint,{method:"PATCH",
    body:JSON.stringify({id:rule.id,confirmation:"APPROVE_FOR_FUTURE_QUOTES"})});
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw Error(data?.status==="effective_date_passed"?
     "The effective date has passed. Create a new future-dated draft.":
     data?.status==="tax_review_required"?"Tax-based rules require a compliance review.":"Approval could not be completed.");
   setNotice("Rule approved for future calculation snapshots only. No money moved.");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Approval failed.")}
  finally{setBusy(false)}
 }

 return <main className="bf-commission-shell">
  <div className="bf-commission-wrap">
   <header className="bf-commission-header">
    <Link href="/admin" aria-label="Back to Biloo Admin"><Icon name="back" size={21}/></Link>
    <div><span className="bf-commission-kicker">BILOO / FINANCIAL OPERATIONS / 04</span>
     <h1>Commission Management</h1>
     <p>Versioned rates, predictable previews and complete approval history.</p></div>
    <button type="button" className="bf-commission-reload" onClick={()=>void load().catch(()=>setError("Refresh failed."))}
      aria-label="Refresh commission data"><Icon name="refresh" size={20}/></button>
   </header>

   <section className="bf-commission-intro">
    <span className="bf-commission-pill"><Icon name="shield" size={16}/> Configuration only · no payouts</span>
    <h2>Every fare deserves a clear calculation.</h2>
    <p>Configure ETB commission proposals and see their impact before approval. Approved rates only create new ride calculation snapshots; they do not collect money, post driver earnings, or rewrite completed trips.</p>
    <div className="bf-commission-stats">
     <div><strong>{view?.rules.filter(r=>r.state==="approved").length??"—"}</strong><span>Approved versions</span></div>
     <div><strong>{view?.rules.filter(r=>r.state==="draft").length??"—"}</strong><span>Draft proposals</span></div>
     <div><strong>{view?.quoteCount??"—"}</strong><span>Future-trip snapshots</span></div>
    </div>
   </section>
   {loading&&<div className="bf-commission-skeleton" aria-busy="true"><span/><span/></div>}
   {error&&<div className="bf-commission-alert error" role="alert"><Icon name="info" size={18}/>{error}</div>}
   {notice&&<div className="bf-commission-alert success" role="status"><Icon name="check" size={18}/>{notice}</div>}
   {view&&<>
    <div className="bf-commission-columns">
     <section className="bf-commission-card">
      <div className="bf-commission-section-head"><div><span className="bf-commission-kicker">01 · POLICY BUILDER</span>
       <h2>New commission version</h2></div><Icon name="settings" size={21}/></div>
      <div className="bf-commission-form">
       <label>Ride category
        <select value={form.rideCategory} onChange={e=>setForm(p=>({...p,rideCategory:e.target.value}))} disabled={busy}>
         {categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select></label>
       <div className="bf-commission-inputgrid">
        <label>Commission (%) <input type="number" inputMode="decimal" min="0" max="100" step=".01"
         value={form.percent} onChange={e=>setForm(p=>({...p,percent:e.target.value}))} placeholder="Enter approved rate" disabled={busy}/></label>
        <label>Fixed fee (ETB)<input type="number" min="0" step=".01" inputMode="decimal"
         value={form.fixedFee} onChange={e=>setForm(p=>({...p,fixedFee:e.target.value}))} disabled={busy}/></label>
        <label>Promotion discount (%)<input type="number" min="0" max="100" step=".01"
         value={form.discount} onChange={e=>setForm(p=>({...p,discount:e.target.value}))} disabled={busy}/></label>
        <label>Driver incentive (ETB)<input type="number" min="0" step=".01"
         value={form.incentive} onChange={e=>setForm(p=>({...p,incentive:e.target.value}))} disabled={busy}/></label>
       </div>
       <label>Effective from<input type="datetime-local" value={form.effectiveFrom} onChange={e=>setForm(p=>({...p,effectiveFrom:e.target.value}))} disabled={busy}/></label>
       <label>Tax rate (%) · compliance review required<input type="number" min="0" max="100" step=".01"
         value={form.tax} onChange={e=>setForm(p=>({...p,tax:e.target.value}))} disabled={busy}/></label>
       <label>Change rationale<textarea rows={3} maxLength={500} placeholder="Explain why the rate is changing"
         value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} disabled={busy}/></label>
       <div className="bf-commission-preview-controls">
        <label>Example ride fare (ETB)<input type="number" min=".01" step=".01"
          value={fare} onChange={e=>setFare(e.target.value)} disabled={busy}/></label>
        <button type="button" className="bf-commission-btn-outline" onClick={()=>void request("preview")} disabled={busy}>Calculate preview</button>
       </div>
       {calculation&&<div className="bf-commission-calc" role="status">
        <span>Illustrative ETB breakdown — not a posted earning</span>
        <div><small>Gross trip fare</small><strong>{calculation.grossEtb}</strong></div>
        <div><small>Commission after discount</small><strong>{calculation.commissionEtb}</strong></div>
        <div><small>Driver incentive</small><strong>{calculation.incentiveEtb}</strong></div>
        <div className="final"><small>Driver share (illustrative)</small><strong>{calculation.driverShareEtb}</strong></div>
        <div><small>Platform net (before tax/expenses)</small><strong>{calculation.platformNetEtb}</strong></div>
       </div>}
       <button type="button" className="bf-commission-btn-main" disabled={busy||!view.canConfigure}
        onClick={()=>void request("draft")}><Icon name="check" size={18}/>{busy?"Processing…":"Save immutable draft"}</button>
       {!view.canConfigure&&<small className="bf-commission-note">Only Biloo super-admins may create or approve commission rules. Other admins may preview.</small>}
       <p className="bf-commission-note">No default rate is assumed. This screen cannot register a bank account or transfer funds. Tax calculations are deferred pending Ethiopian compliance review.</p>
      </div>
     </section>
     <div className="bf-commission-list-column">
      <section className="bf-commission-card">
       <div className="bf-commission-section-head"><div><span className="bf-commission-kicker">02 · VERSIONS</span><h2>Rate history</h2></div><Icon name="clock" size={20}/></div>
       {!view.rules.length?<div className="bf-commission-empty"><Icon name="shield" size={24}/><strong>No commission rules configured</strong><p>There is no hidden or assumed platform percentage. Save a draft to begin.</p></div>:
        <div className="bf-commission-rule-list">{view.rules.map(rule=><article key={rule.id} className="bf-commission-rule">
         <div className="bf-commission-rule-top"><strong>{categories.find(c=>c[0]===rule.ride_category)?.[1]||rule.ride_category}</strong>
         <span className={rule.state==="approved"?"approved":"draft"}>{rule.state}</span></div>
         <strong className="bf-commission-rule-rate">{(rule.commission_bps/100).toFixed(2)}% <small>+ {etbMinor(rule.fixed_fee_minor)} ETB fixed</small></strong>
         <p>{(rule.discount_bps/100).toFixed(2)}% discount · {etbMinor(rule.incentive_minor)} ETB incentive</p>
         <small>Effective {dateLabel(rule.effective_from)}</small>
         {rule.note&&<p className="bf-commission-rule-note">{rule.note}</p>}
         {rule.state==="draft"&&view.canConfigure&&<button type="button" onClick={()=>void approve(rule)} disabled={busy}>
          Approve future quotes <Icon name="chevron" size={16}/></button>}
        </article>)}</div>}
      </section>
      <section className="bf-commission-card">
       <div className="bf-commission-section-head"><div><span className="bf-commission-kicker">03 · AUDIT TRAIL</span><h2>Recorded decisions</h2></div><Icon name="list" size={20}/></div>
       {!view.audits.length?<p className="bf-commission-note">No commission changes have been recorded.</p>:<div className="bf-commission-audits">
        {view.audits.map(event=><div key={event.id}><span className="bf-commission-event-icon"><Icon name={event.event_type==="rule_approved"?"check":"clock"} size={16}/></span>
         <div><strong>{event.event_type==="rule_approved"?"Rule approved":"Draft created"}</strong>
          <small>{dateLabel(event.created_at)} · Rule {event.rule_id.slice(0,8)}</small></div></div>)}
       </div>}
      </section>
     </div>
    </div>
   </>}
  </div>
 </main>;
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../../components/nexride/ui";
import { nexrideApiFetch } from "../../../../lib/nexride-api-auth";
import "./ledger.css";

type Account={code:string;name:string;account_class:string;currency:string;active:boolean};
type Journal={id:string;source_key:string;source_type:string;description:string;status:string;created_at:string;currency:string};
type Line={id:string;journal_id:string;account_code:string;side:string;amount_minor:number|string;currency:string;created_at:string};
type Run={id:string;provider:string;status:string;period_start:string;period_end:string;created_at:string};
type Exception={id:string;source_kind:string;source_reference:string;exception_type:string;severity:string;status:string;created_at:string};
type Audit={id:string;event_type:string;journal_id:string;created_at:string};
type LedgerData={
 status:string; postingEnabled:boolean; currency:string;
 counts:{journals:number;openExceptions:number;reconciliationRuns:number};
 accounts:Account[];journals:Journal[];entries:Line[];reconciliationRuns:Run[];
 exceptions:Exception[];audit:Audit[];note:string;
};
type Preview={status:string;amountEtb:string;debitMinor:string;creditMinor:string;balanced:boolean;lines:number};
const fmtDate=(v:string)=>new Date(v).toLocaleString("en-ET",{dateStyle:"medium",timeStyle:"short"});
const friendly=(v:string)=>v.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase());

export default function FinancialLedgerPage(){
 const [data,setData]=useState<LedgerData|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [debit,setDebit]=useState("1100");
 const [credit,setCredit]=useState("2100");
 const [amount,setAmount]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [theme,setTheme]=useState<"light"|"dark">("light");
 useEffect(()=>{
  try{setTheme(localStorage.getItem("nexride.admin.theme")==="dark"?"dark":"light");}catch{}
 },[]);
 const refresh=useCallback(async()=>{
  const res=await nexrideApiFetch("/api/admin/finance/ledger",{cache:"no-store"});
  const payload=await res.json().catch(()=>null) as LedgerData|null;
  if(res.status===401||res.status===403)throw Error("Administrator authentication is required to view finance records.");
  if(!res.ok||payload?.status!=="ready")throw Error("Financial records are temporarily unavailable.");
  setData(payload);
 },[]);
 useEffect(()=>{
  let active=true;
  refresh().catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to load ledger.")})
   .finally(()=>{if(active)setLoading(false)});
  return ()=>{active=false};
 },[refresh]);
 const accountByCode=useMemo(()=>new Map((data?.accounts??[]).map(a=>[a.code,a.name])),[data]);
 async function previewJournal(){
  if(busy)return;
  setBusy(true);setError("");setMessage("");setPreview(null);
  try{
   const text=amount.trim();
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text) || Number(text)<=0)
    throw Error("Enter a positive ETB amount with at most two decimal places.");
   const [major,frac=""]=text.split(".");
   const minor=(BigInt(major)*BigInt(100)+BigInt((frac+"00").slice(0,2))).toString();
   if(BigInt(minor)>BigInt("999999999999999"))throw Error("Amount exceeds supported accounting precision.");
   const res=await nexrideApiFetch("/api/admin/finance/ledger",{
    method:"POST",body:JSON.stringify({action:"preview_balance",lines:[
     {account_code:debit,side:"debit",amount_minor:minor},
     {account_code:credit,side:"credit",amount_minor:minor},
    ]}),
   });
   const result=await res.json().catch(()=>null) as Preview&{reason?:string};
   if(!res.ok||result?.status!=="balanced_preview")
    throw Error(result?.reason||"Could not verify the proposed journal.");
   setPreview(result);
   setMessage("Balanced preview calculated. No ledger entry or transfer was created.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to calculate preview.")}
  finally{setBusy(false)}
 }
 const accountGroups=["asset","liability","revenue","expense"] as const;
 return <main className="bf-ledger-page" data-theme={theme}>
  <div className="bf-ledger-wrap">
   <header className="bf-ledger-header">
    <Link href="/admin" aria-label="Back to Biloo administration"><Icon name="back" size={21}/></Link>
    <div><span className="bf-ledger-overline">BILOO · FINANCIAL OPERATIONS · PHASE 05</span>
      <h1>Financial Ledger</h1>
      <p>Enterprise accounting controls, journal integrity and reconciliation visibility.</p>
    </div>
    <button type="button" onClick={()=>void refresh().catch(()=>setError("Refresh failed."))} aria-label="Refresh ledger"><Icon name="refresh" size={19}/></button>
   </header>

   <section className="bf-ledger-hero">
     <div className="bf-ledger-hero-top"><span><Icon name="shield" size={16}/> Protected financial infrastructure</span><Icon name="lock" size={22}/></div>
     <h2>One reliable source of financial truth.</h2>
     <p>Every journal must balance. Posted records are immutable. Reconciliation issues remain visible until independently investigated.</p>
     <div className="bf-ledger-state"><span className="bf-ledger-dot"/>{data?.postingEnabled?"Posting configuration enabled":"Journal posting disabled · API integration deferred"}</div>
   </section>

   {loading&&<div className="bf-ledger-loading" aria-busy="true"><span/><span/></div>}
   {error&&<div role="alert" className="bf-ledger-alert"><Icon name="info" size={18}/>{error}</div>}
   {message&&<div role="status" className="bf-ledger-alert success"><Icon name="check" size={18}/>{message}</div>}
   {data&&<>
    <div className="bf-ledger-metrics">
     <Metric title="Chart of accounts" value={data.accounts.length} hint="ETB account categories" icon="list"/>
     <Metric title="Posted journals" value={data.counts.journals} hint="Verified journal records only" icon="check"/>
     <Metric title="Reconciliation runs" value={data.counts.reconciliationRuns} hint="Recent internal or provider runs" icon="refresh"/>
     <Metric title="Open exceptions" value={data.counts.openExceptions} hint="Items requiring investigation" icon="info"/>
    </div>

    <div className="bf-ledger-columns">
     <section className="bf-ledger-card">
      <div className="bf-ledger-card-header"><div><span>01 · LEDGER VALIDATION</span><h2>Balanced journal preview</h2></div><Icon name="chart" size={23}/></div>
      <p className="bf-ledger-lead">Check a debit and credit against active account codes. This is an illustration only: no transaction, financial entry or account balance is stored.</p>
      <div className="bf-ledger-form">
       <label>Debit account
        <select value={debit} onChange={e=>{setDebit(e.target.value);setPreview(null)}} disabled={busy}>
         {data.accounts.filter(a=>a.active).map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
       </label>
       <label>Credit account
        <select value={credit} onChange={e=>{setCredit(e.target.value);setPreview(null)}} disabled={busy}>
         {data.accounts.filter(a=>a.active).map(a=><option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
        </select>
       </label>
       <label>Example amount · ETB
        <input type="text" inputMode="decimal" placeholder="Enter an amount" value={amount}
         onChange={e=>{setAmount(e.target.value);setPreview(null)}} disabled={busy}/>
       </label>
       <button type="button" onClick={()=>void previewJournal()} disabled={busy||!amount.trim()}>
        <Icon name="check" size={18}/>{busy?"Verifying…":"Validate debits and credits"}
       </button>
      </div>
      {preview&&<div className="bf-ledger-preview"><div><span>Debits</span><strong>ETB {preview.amountEtb}</strong></div>
       <div><span>Credits</span><strong>ETB {preview.amountEtb}</strong></div>
       <p><Icon name="check" size={17}/> Balanced, not posted</p></div>}
      <p className="bf-ledger-disclaimer">Posting remains disabled until Biloo completes evidence verification, approval controls and the final payment-gateway integration.</p>
     </section>

     <section className="bf-ledger-card">
      <div className="bf-ledger-card-header"><div><span>02 · ACCOUNT STRUCTURE</span><h2>Chart of accounts</h2></div><Icon name="list" size={22}/></div>
      <div className="bf-ledger-account-groups">{accountGroups.map(group=><section key={group}>
       <h3>{friendly(group)}</h3>
       {data.accounts.filter(a=>a.account_class===group).map(a=><div className="bf-ledger-account" key={a.code}>
        <span className="bf-ledger-account-code">{a.code}</span><strong>{a.name}</strong><small>{a.currency}</small>
       </div>)}
      </section>)}</div>
     </section>
    </div>

    <section className="bf-ledger-card">
     <div className="bf-ledger-card-header"><div><span>03 · RECONCILIATION</span><h2>Exception queue</h2></div><Icon name="shield" size={22}/></div>
     {!data.exceptions.length?<Empty title="No reconciliation exceptions recorded"
       detail="This is not confirmation that provider or cash settlement is reconciled. Provider verification remains inactive."/>:
       <div className="bf-ledger-list">{data.exceptions.map(item=><div className="bf-ledger-record" key={item.id}>
        <div><strong>{friendly(item.exception_type)}</strong><small>{item.source_kind} · {item.source_reference}</small></div>
        <span>{item.status} · {item.severity}</span></div>)}</div>}
     <div className="bf-ledger-secondary"><Link href="/admin/finance/commissions">Commission Management <Icon name="chevron" size={16}/></Link>
      <span>Gateway reconciliation will be connected in the final phase.</span></div>
    </section>

    <section className="bf-ledger-card">
     <div className="bf-ledger-card-header"><div><span>04 · JOURNALS</span><h2>Posted ledger history</h2></div><Icon name="clock" size={22}/></div>
     {!data.journals.length?<Empty title="No financial journals posted"
       detail="Historical ride fares and driver earnings remain in their existing systems. This new ledger does not assume they were collected or settled."/>:
      <div className="bf-ledger-list">{data.journals.map(item=><div className="bf-ledger-record" key={item.id}>
       <div><strong>{item.description}</strong><small>{friendly(item.source_type)} · {fmtDate(item.created_at)}</small></div>
       <span>{item.status}</span></div>)}</div>}
    </section>
   </>}
  </div>
 </main>;
}

function Metric({title,value,hint,icon}:{title:string;value:number;hint:string;icon:"list"|"check"|"refresh"|"info"}){
 return <div className="bf-ledger-metric"><span className="bf-ledger-metric-icon"><Icon name={icon} size={18}/></span>
  <small>{title}</small><strong>{value.toLocaleString("en-ET")}</strong><p>{hint}</p></div>;
}
function Empty({title,detail}:{title:string;detail:string}){
 return <div className="bf-ledger-empty"><Icon name="clock" size={22}/><strong>{title}</strong><p>{detail}</p></div>;
}

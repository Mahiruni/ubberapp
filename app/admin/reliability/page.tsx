"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { nexrideApiFetch } from "../../../lib/nexride-api-auth";
import "../admin.css";

type Metrics = {
  onlineDrivers:number; dispatchEligibleDrivers:number; waitingRiders:number;
  registeredDevices:number; pendingPush:number; acceptedByFcm:number; skippedPush:number;
};
const tiles: { key:keyof Metrics; label:string; description:string }[] = [
  {key:"onlineDrivers",label:"Online drivers",description:"Self-selected availability"},
  {key:"dispatchEligibleDrivers",label:"GPS-ready drivers",description:"Fresh, accurate and verified"},
  {key:"waitingRiders",label:"Waiting Rider requests",description:"Existing server-side queue"},
  {key:"registeredDevices",label:"Android push devices",description:"Registered installations"},
  {key:"pendingPush",label:"Push events pending",description:"Not yet acknowledged by FCM"},
  {key:"acceptedByFcm",label:"FCM accepted events",description:"Server handoff, not a read receipt"},
  {key:"skippedPush",label:"Skipped push events",description:"Expired, stale or no device"},
];
export default function AdminReliabilityPage() {
  const [metrics,setMetrics]=useState<Metrics|null>(null);
  const [status,setStatus]=useState("Loading reliability indicators…");
  const [loading,setLoading]=useState(true);
  async function refresh(){
    setLoading(true);
    try {
      const result=await nexrideApiFetch("/api/admin/reliability",{cache:"no-store"});
      const data=await result.json();
      if(!result.ok || !data.metrics)throw new Error("permission_or_data_unavailable");
      setMetrics(data.metrics as Metrics);setStatus("Server metrics refreshed");
    }catch{setStatus("Reliability metrics unavailable. Sign in with an active Admin account.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  return <main className="admin-app" style={{display:"block",padding:"clamp(18px,5vw,48px)"}}>
    <div style={{maxWidth:1180,margin:"0 auto"}}>
      <Link href="/admin" style={{color:"#5145e5",fontWeight:750,fontSize:13}}>← Back to Admin Dashboard</Link>
      <header style={{margin:"30px 0 24px"}}>
        <p className="admin-kicker">BILOO · OPERATIONS</p>
        <h1 style={{fontSize:"clamp(28px,5vw,42px)",letterSpacing:"-.05em",margin:"8px 0"}}>Android Reliability</h1>
        <p style={{fontSize:14,color:"#667587",maxWidth:640,lineHeight:1.6}}>Monitor real Driver GPS eligibility, the Rider matching queue, and native push handoffs. No location coordinates or FCM tokens are exposed.</p>
      </header>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:12}}>
        <span role="status" style={{fontSize:12}}>{status}</span>
        <button type="button" onClick={()=>void refresh()} disabled={loading} style={{minHeight:44,border:"1px solid #5145e5",borderRadius:12,padding:"10px 18px",color:"#5145e5",fontWeight:750}}>
          {loading?"Refreshing…":"Refresh"}
        </button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12}}>
        {tiles.map(t=><article key={t.key} className="admin-card" style={{padding:20}}>
          <small style={{display:"block",color:"#667587",fontSize:11}}>{t.label}</small>
          <strong style={{display:"block",fontSize:32,margin:"10px 0",letterSpacing:"-.04em"}}>{metrics?.[t.key]??"—"}</strong>
          <span style={{fontSize:11,color:"#667587"}}>{t.description}</span>
        </article>)}
      </div>
      <p style={{fontSize:12,color:"#667587",lineHeight:1.6,marginTop:22}}>
        Push delivery requires configured FCM credentials, Android Firebase app configuration, and an authorized worker schedule. Server acceptance does not prove Android notification display.
      </p>
    </div>
  </main>;
}

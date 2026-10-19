"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

export default function CampaignSettings() {
 const [enabled,setEnabled]=useState<boolean|null>(null);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 async function call(method:"GET"|"POST",body?:object) {
  const {data:{session}}=await supabase.auth.getSession();
  if(!session) throw new Error("Administrator sign-in required.");
  const response=await fetch("/api/admin/campaign-settings",{method,headers:{Authorization:"Bearer "+session.access_token,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,cache:"no-store"});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error||"Request failed");
  return result;
 }
 useEffect(()=>{void call("GET").then(data=>{setEnabled(data.bulkEnabled);setMessage(data.message)}).catch(e=>setMessage(String(e)));},[]);
 async function disable(){
  if(!window.confirm("Disable all bulk campaign delivery?"))return;
  setBusy(true);
  try {const data=await call("POST",{enabled:false,confirm:true});setEnabled(data.bulkEnabled);setMessage(data.message)}
  catch(e){setMessage(e instanceof Error?e.message:"Update failed")}
  finally{setBusy(false)}
 }
 return <main style={{minHeight:"100vh",background:"#F5F7F9",color:"#102334",padding:"clamp(20px,5vw,60px)",fontFamily:"Inter,Arial,sans-serif"}}>
  <div style={{maxWidth:1000,margin:"auto"}}>
   <Link href="/admin" style={{color:"#041C30"}}>← Biloo Admin</Link>
   <header style={{background:"#041C30",color:"#fff",borderRadius:24,padding:"clamp(24px,4vw,48px)",marginTop:22}}>
    <p style={{color:"#00C878",fontWeight:800,letterSpacing:2}}>BILOO · COMMUNICATIONS SECURITY</p>
    <h1 style={{fontSize:"clamp(36px,6vw,60px)",lineHeight:1.05,margin:"12px 0"}}>Bulk messaging controls</h1>
    <p style={{fontSize:16,opacity:.85}}>Administrator-only delivery settings and campaign safety.</p>
   </header>
   <section style={{background:"#fff",border:"1px solid #DFE7EB",borderRadius:20,padding:28,marginTop:22}}>
    <h2 style={{fontSize:28}}>Campaign delivery</h2>
    <p><strong>Current state:</strong> {enabled===null?"Checking…":enabled?"Enabled":"Disabled"}</p>
    <p role="status">{message}</p>
    <button type="button" disabled={busy||enabled!==true} onClick={disable} style={{background:"#041C30",color:"white",border:0,borderRadius:12,padding:"14px 22px",opacity:enabled===true?1:.55}}>Disable bulk messaging</button>
    <p style={{fontSize:13,color:"#667587",marginTop:16}}>Enabling is intentionally locked until opt-in, unsubscribe, rate limiting, idempotency, and worker controls are validated. Transactional account emails are unaffected.</p>
    <Link href="/admin/prelaunch-campaign" style={{display:"inline-block",marginTop:16,color:"#067b46",fontWeight:700}}>Open pre-launch campaign →</Link>
   </section>
  </div>
 </main>;
}

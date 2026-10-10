"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Campaign = { subject:string; body:string; html:string; status:string; message:string; sendEnabled:boolean; recipients:number|null };
export default function PrelaunchCampaignPage() {
  const [campaign,setCampaign] = useState<Campaign|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    let mounted=true;
    (async () => {
      try {
        const {data:{session}} = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in as a NexRide administrator to view this campaign.");
        const response = await fetch("/api/admin/prelaunch-campaign",{headers:{Authorization:"Bearer "+session.access_token},cache:"no-store"});
        if (!response.ok) throw new Error(response.status===403?"Administrator access required.":"Campaign preview is unavailable.");
        const result=await response.json();
        if(mounted)setCampaign(result);
      } catch(e) { if(mounted)setError(e instanceof Error?e.message:"Could not load campaign."); }
      finally { if(mounted)setLoading(false); }
    })();
    return ()=>{mounted=false;};
  },[]);
  return <main style={{minHeight:"100vh",background:"#F5F7F9",color:"#102334",padding:"clamp(16px,4vw,48px)",fontFamily:"Arial, sans-serif"}}>
    <div style={{maxWidth:1000,margin:"auto"}}>
      <Link href="/admin" style={{color:"#041C30"}}>← Admin Dashboard</Link>
      <header style={{background:"#041C30",color:"white",borderRadius:20,padding:28,marginTop:24}}>
        <div style={{fontSize:14,color:"#00C878",fontWeight:700}}>NEXRIDE · ADMIN COMMUNICATIONS</div>
        <h1 style={{fontSize:"clamp(24px,4vw,34px)",margin:"12px 0"}}>Pre-launch email campaign</h1>
        <p style={{opacity:.8}}>A branded bilingual announcement for the NexRide community.</p>
        <span style={{display:"inline-block",background:"#17435A",padding:"8px 12px",borderRadius:24}}>Draft · Sending disabled</span>
      </header>
      {loading&&<p role="status">Loading secure campaign preview…</p>}
      {error&&<p role="alert" style={{color:"#a32020"}}>{error}</p>}
      {campaign&&<section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,340px),1fr))",gap:20,marginTop:24}}>
        <div style={{background:"white",borderRadius:18,padding:24}}>
          <h2>Campaign controls</h2>
          <p><strong>Subject</strong></p><p>{campaign.subject}</p>
          <p><strong>Recipients</strong></p><p>Not calculated — eligibility integration pending</p>
          <p><strong>Delivery</strong></p><p>Not configured</p>
          <button type="button" disabled style={{background:"#041C30",color:"white",border:0,padding:"13px 18px",borderRadius:12,opacity:.5,cursor:"not-allowed"}}>Send campaign · Unavailable</button>
          <p style={{fontSize:13,color:"#667587",lineHeight:1.6}}>{campaign.message}</p>
        </div>
        <div style={{background:"white",borderRadius:18,padding:24}}>
          <h2>Approved email preview</h2>
          <iframe title="Bilingual NexRide prelaunch email" sandbox="" srcDoc={campaign.html} style={{width:"100%",height:540,border:"1px solid #dfe5e8",borderRadius:12}} />
          <details><summary>Plain-text version</summary><pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",lineHeight:1.8}}>{campaign.body}</pre></details>
        </div>
      </section>}
    </div>
  </main>;
}

"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./admin-account-identities.css";

type Profile = { id:string; full_name:string|null; role:string; phone:string|null; account_status:string };
type Document = { id:string;user_id:string;document_type:string;issuing_country:string;status:string;created_at:string;storage_bucket:string;storage_path:string|null };
type Review = {id:string;user_id:string;category:string;detail:string;status:string;created_at:string};
type Deletion = {id:string;user_id:string;status:string;created_at:string};
type Summary = {accounts:number;legacyPhoneConflictGroups:number;identityDocuments:number;openIdentityReviews:number};

const mask = (s:string|null) => !s ? "—" : s.length > 5 ? "•••" + s.slice(-3) : "••••";
const actionDate = (s:string) => new Date(s).toLocaleDateString("en-ET",{year:"numeric",month:"short",day:"numeric"});

export function AdminAccountIdentities() {
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [docs,setDocs]=useState<Document[]>([]);
  const [reviews,setReviews]=useState<Review[]>([]);
  const [deletions,setDeletions]=useState<Deletion[]>([]);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");

  async function load(){
    const [a,b,c,d,e]=await Promise.all([
      supabase.from("profiles").select("id,full_name,phone,role,account_status").order("created_at",{ascending:false}).limit(100),
      supabase.from("account_identity_documents").select("id,user_id,document_type,issuing_country,status,created_at,storage_bucket,storage_path").order("created_at",{ascending:false}).limit(100),
      supabase.from("account_identity_reviews").select("id,user_id,category,detail,status,created_at").order("created_at",{ascending:false}).limit(100),
      supabase.from("account_deletion_requests").select("id,user_id,status,created_at").order("created_at",{ascending:false}).limit(100),
      supabase.rpc("admin_account_identity_audit"),
    ]);
    if(a.error||b.error||c.error||d.error||e.error)throw new Error("admin_account_read_failed");
    setProfiles((a.data||[]) as Profile[]);setDocs((b.data||[]) as Document[]);
    setReviews((c.data||[]) as Review[]);setDeletions((d.data||[]) as Deletion[]);
    setSummary((e.data||null) as Summary|null);setLoading(false);
  }
  useEffect(()=>{
    let active=true;
    void load().catch(()=>{if(active){setError("This account information is unavailable. Confirm your admin permissions and retry.");setLoading(false);}});
    return()=>{active=false};
  },[]);

  const names=useMemo(()=>new Map(profiles.map(p=>[p.id,p.full_name||"Member "+p.id.slice(0,8)])),[profiles]);
  const matches=(id:string)=>(names.get(id)||id).toLowerCase().includes(query.toLowerCase())||id.includes(query);
  const visibleProfiles=profiles.filter(p=>matches(p.id));
  const visibleDocs=docs.filter(d=>matches(d.user_id));
  const visibleReviews=reviews.filter(r=>matches(r.user_id));
  const visibleDeletions=deletions.filter(d=>matches(d.user_id));

  async function preview(document:Document) {
    if(!document.storage_path)return;
    // Open a placeholder synchronously to avoid popup blockers, then navigate
    // only after RLS authorizes the 60-second private signed URL.
    const tab=window.open("about:blank","_blank");
    if (tab) tab.opener=null;
    const signed=await supabase.storage.from(document.storage_bucket)
      .createSignedUrl(document.storage_path,60);
    if(signed.error||!signed.data?.signedUrl){
      tab?.close();
      setError("Private document preview could not be opened. Confirm storage permissions.");
      return;
    }
    if(tab)tab.location.href=signed.data.signedUrl;
    else setNotice("Allow pop-ups for NexRide to review this private document.");
  }

  async function decide(kind:"document"|"ownership"|"deletion",id:string,status:string) {
    if(busy)return;
    setBusy(id);setNotice("");setError("");
    const fn=kind==="document"?"admin_account_identity_review":
      kind==="ownership"?"admin_account_ownership_review":"admin_account_deletion_review";
    const args=kind==="document"?{p_document:id,p_status:status}:{p_id:id,p_status:status};
    const r=await supabase.rpc(fn,args);
    if(r.error||r.data!=="saved"){setError("Decision not saved. Check the latest record and permissions.");setBusy("");return;}
    await load().catch(()=>setError("Decision saved but list could not refresh."));
    setNotice(kind==="deletion"?"Review decision recorded. No account data was automatically erased.":"Review decision saved with an admin audit entry.");
    setBusy("");
  }

  return <main className="nex-admin-identity">
    <header className="nex-admin-identity-heading">
      <div><p>IDENTITY GOVERNANCE</p><h1>Account management</h1>
        <span>Verified ownership, private document review, and safe deletion requests</span></div>
      <button type="button" onClick={()=>void load().catch(()=>setError("Could not refresh."))}>Refresh</button>
    </header>
    {error&&<div className="nex-admin-error" role="alert">{error}</div>}
    {notice&&<div className="nex-admin-notice" role="status">{notice}</div>}
    <div className="nex-admin-metrics">
      <div><small>Accounts</small><strong>{summary?.accounts??"—"}</strong></div>
      <div><small>Document records</small><strong>{summary?.identityDocuments??"—"}</strong></div>
      <div><small>Ownership reviews</small><strong>{summary?.openIdentityReviews??"—"}</strong></div>
      <div><small>Legacy phone conflicts</small><strong>{summary?.legacyPhoneConflictGroups??"—"}</strong></div>
    </div>
    <p className="nex-admin-warning">Phone conflicts are unverified legacy records. Do not merge or delete accounts based on a matching phone. Require verified ownership and authorized review.</p>
    <label className="nex-admin-search">Search account by name or reference
      <input type="search" placeholder="Account name or internal reference" value={query} onChange={e=>setQuery(e.target.value)} />
    </label>
    {loading?<p>Loading authorized account records…</p>: <>
      <section className="nex-admin-pane">
        <h2>Account directory <small>{visibleProfiles.length}</small></h2>
        {visibleProfiles.length===0?<p>No accounts match.</p>:visibleProfiles.map(p=><div className="nex-admin-row" key={p.id}>
          <div><strong>{p.full_name||"Unnamed account"}</strong><small>{p.id.slice(0,8)} · {p.role}</small></div>
          <div><span>{p.account_status}</span><small>Phone {mask(p.phone)} · Unverified until OTP</small></div>
        </div>)}
      </section>
      <section className="nex-admin-pane">
        <h2>Identity document review <small>{visibleDocs.length}</small></h2>
        {visibleDocs.length===0?<p>No identity documents in this selection.</p>:visibleDocs.map(d=><div className="nex-admin-row" key={d.id}>
          <div><strong>{names.get(d.user_id)||"Member"} · {d.document_type.replace(/_/g," ")}</strong><small>{d.issuing_country} · Submitted {actionDate(d.created_at)}</small></div>
          <div className="nex-admin-decisions"><span className="nex-admin-pill">{d.status}</span>
            {d.storage_path&&<button type="button" disabled={!!busy} onClick={()=>void preview(d)}>View evidence</button>}
            {d.status==="pending"||d.status==="rejected"?<>
              <button type="button" disabled={!!busy} onClick={()=>void decide("document",d.id,"approved")}>Approve</button>
              <button type="button" disabled={!!busy} onClick={()=>void decide("document",d.id,"rejected")}>Reject</button>
            </>:null}
            {d.status==="approved"&&<button type="button" disabled={!!busy} onClick={()=>void decide("document",d.id,"revoked")}>Revoke</button>}
          </div>
        </div>)}
      </section>
      <section className="nex-admin-pane">
        <h2>Identity and ownership disputes <small>{visibleReviews.length}</small></h2>
        {visibleReviews.length===0?<p>No review requests.</p>:visibleReviews.map(r=><div className="nex-admin-row" key={r.id}>
          <div><strong>{names.get(r.user_id)||"Member"} · {r.category.replace(/_/g," ")}</strong>
            <small>{r.detail.slice(0,220)}</small><small>{actionDate(r.created_at)}</small></div>
          <div className="nex-admin-decisions"><span>{r.status}</span>
            {r.status==="pending"||r.status==="under_review"?<>
              <button type="button" disabled={!!busy} onClick={()=>void decide("ownership",r.id,"under_review")}>Review</button>
              <button type="button" disabled={!!busy} onClick={()=>void decide("ownership",r.id,"resolved")}>Resolve</button>
            </>:null}
          </div>
        </div>)}
      </section>
      <section className="nex-admin-pane">
        <h2>Account deletion requests <small>{visibleDeletions.length}</small></h2>
        <p>Admin approval is a review step only. Deletion, legal retention and identifier release need separate authorized processing.</p>
        {visibleDeletions.length===0?<p>No requests.</p>:visibleDeletions.map(d=><div className="nex-admin-row" key={d.id}>
          <div><strong>{names.get(d.user_id)||"Member"}</strong><small>Requested {actionDate(d.created_at)}</small></div>
          <div className="nex-admin-decisions"><span>{d.status}</span>
            {["pending","under_review","on_hold"].includes(d.status)?<>
              <button type="button" disabled={!!busy} onClick={()=>void decide("deletion",d.id,"under_review")}>Review</button>
              <button type="button" disabled={!!busy} onClick={()=>void decide("deletion",d.id,"on_hold")}>Hold</button>
              <button type="button" disabled={!!busy} onClick={()=>void decide("deletion",d.id,"approved")}>Approve review</button>
            </>:null}
          </div>
        </div>)}
      </section>
    </>}
  </main>;
}

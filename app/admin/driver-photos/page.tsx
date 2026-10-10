"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import "./driver-photos.css";

type Photo = { id:string; driver_id:string; storage_path:string; created_at:string; status:string; rejection_reason:string|null };
export default function AdminDriverPhotos() {
  const [allowed,setAllowed] = useState(false);
  const [checking,setChecking] = useState(true);
  const [loading,setLoading] = useState(false);
  const [photos,setPhotos] = useState<Photo[]>([]);
  const [urls,setUrls] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [reason,setReason] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {data,error:e} = await supabase.from("driver_profile_photos")
        .select("id,driver_id,storage_path,created_at,status,rejection_reason")
        .eq("status","pending_review").order("created_at",{ascending:true}).limit(100);
      if(e) throw e;
      const list = (data||[]) as Photo[];
      const signed = await Promise.all(list.map(async p => {
        const {data:url} = await supabase.storage.from("nexride-driver-photos").createSignedUrl(p.storage_path,300);
        return [p.id,url?.signedUrl||""] as const;
      }));
      setPhotos(list);
      setUrls(Object.fromEntries(signed));
    } catch {
      setError("Unable to load pending photos. Check your connection and permissions.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const {data} = await supabase.auth.getUser();
        if(!data.user) return;
        const {data:profile} = await supabase.from("profiles")
          .select("role,account_status").eq("id",data.user.id).maybeSingle();
        if(!active) return;
        const ok = profile?.role === "admin" && profile?.account_status === "active";
        setAllowed(ok);
        if(ok) await load();
      } finally { if(active) setChecking(false); }
    })().catch(()=>{if(active){setError("Administrator verification failed.");setChecking(false);}});
    return () => { active = false; };
  }, [load]);

  const review = async (id:string,approve:boolean) => {
    const why = reason[id]?.trim()||"";
    if(!approve && !why){setError("Enter a rejection reason before rejecting a photo.");return;}
    setBusy(id);setError("");setMessage("");
    try {
      const {error:e} = await supabase.rpc("review_driver_profile_photo",{
        p_photo_id:id,p_approve:approve,p_reason:approve?null:why
      });
      if(e) throw e;
      setMessage(approve?"Driver portrait approved.":"Driver portrait rejected.");
      await load();
    } catch {setError("Review could not be saved. Refresh the queue and try again.");}
    finally {setBusy("");}
  };

  if(checking) return <main className="nr-photo-admin-state" aria-busy="true"><p>Verifying administrator access…</p></main>;
  if(!allowed) return <main className="nr-photo-admin-state"><h1>Access restricted</h1><p>This queue is available only to active NexRide administrators.</p><Link href="/admin">Return to Admin</Link></main>;

  return <main className="nr-photo-admin">
    <header className="nr-photo-admin-header">
      <div className="nr-photo-admin-heading">
        <Link href="/admin" className="nr-photo-admin-back">← Admin dashboard</Link>
        <span className="nr-photo-admin-kicker">NEXRIDE / TRUST & SAFETY</span>
        <h1>Driver photo verification</h1>
        <p>Review pending portraits before they appear on active Rider trips. Originals stay in private storage.</p>
      </div>
      <button type="button" className="nr-photo-admin-refresh" onClick={()=>void load()} disabled={loading||!!busy}>
        {loading?"Refreshing…":"↻ Refresh queue"}
      </button>
    </header>
    <section className="nr-photo-admin-stats" aria-label="Review queue status">
      <div><strong>{photos.length}</strong><span>Awaiting review</span></div>
      <div><strong>Private</strong><span>Storage protection</span></div>
      <div><strong>Approval</strong><span>Required for Riders</span></div>
    </section>
    {error&&<p role="alert" className="nr-photo-admin-error">{error}</p>}
    {message&&<p role="status" className="nr-photo-admin-success">{message}</p>}
    {!loading&&photos.length===0&&!error&&<section className="nr-photo-admin-empty"><span aria-hidden="true">✓</span><h2>All caught up</h2><p>No Driver portraits currently await review.</p></section>}
    {loading&&photos.length===0&&<p className="nr-photo-admin-loading" role="status">Loading secure review queue…</p>}
    <div className="nr-photo-admin-list">
      {photos.map(photo=><article className="nr-photo-admin-card" key={photo.id} aria-label="Driver submitted photo">
        <div className="nr-photo-admin-image">
          {urls[photo.id]?<img src={urls[photo.id]} alt="Private portrait submitted by a Driver for review"/>:<div role="status">Preview unavailable. Refresh to retry.</div>}
        </div>
        <div className="nr-photo-admin-details">
          <div className="nr-photo-admin-meta"><span className="nr-photo-admin-pending">Pending review</span><time dateTime={photo.created_at}>{new Date(photo.created_at).toLocaleString()}</time></div>
          <h2>Driver portrait</h2>
          <p className="nr-photo-admin-id">Account: {photo.driver_id}</p>
          <p className="nr-photo-admin-guidance">Approve only if the image clearly shows one identifiable person, without filters or obstructions.</p>
          <label htmlFor={"photo-reason-"+photo.id}>Reason for rejection</label>
          <textarea id={"photo-reason-"+photo.id} value={reason[photo.id]||""}
            onChange={e=>setReason(s=>({...s,[photo.id]:e.target.value}))}
            placeholder="Required when rejecting this photo" rows={2} maxLength={500} disabled={busy===photo.id}/>
          <div className="nr-photo-admin-actions">
            <button type="button" className="nr-photo-admin-approve" disabled={!!busy||!urls[photo.id]} onClick={()=>void review(photo.id,true)}>{busy===photo.id?"Saving…":"✓ Approve photo"}</button>
            <button type="button" className="nr-photo-admin-reject" disabled={!!busy} onClick={()=>void review(photo.id,false)}>Reject photo</button>
          </div>
        </div>
      </article>)}
    </div>
  </main>;
}

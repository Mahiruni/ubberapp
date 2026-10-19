"use client";
import { useCallback,useEffect,useState } from "react";
import { Icon } from "./ui";
import { nexrideApiFetch } from "../../lib/nexride-api-auth";
import { shareNexRideTripLink } from "../../lib/nexride-native-share";

type ShareRecord={id:string;created_at:string;expires_at:string;revoked_at:string|null};
type Role="rider"|"driver";
export function NativeTripSharePanel({tripId,role,userId,online}:{
 tripId:string|null;role:Role;userId:string;online:boolean;
}) {
 const [minutes,setMinutes]=useState<15|30|60>(30);
 const [links,setLinks]=useState<ShareRecord[]>([]);
 const [current,setCurrent]=useState<{id:string;url:string;expiresAt:string}|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("");
 const [revokeBusy,setRevokeBusy]=useState<string|null>(null);
 const available=!!tripId&&!!userId&&online;
 const refresh=useCallback(async()=>{
  if(!tripId||!userId||!online)return;
  try{
   const response=await nexrideApiFetch("/api/trip-share?tripId="+encodeURIComponent(tripId),{cache:"no-store"});
   if(!response.ok)return;
   const body=await response.json() as {links?:ShareRecord[]};
   setLinks(body.links||[]);
  }catch{}
 },[tripId,userId,online]);
 useEffect(()=>{void refresh();},[refresh]);

 const create=async()=>{
  if(!available||busy)return;
  setBusy(true);setStatus("");
  try{
   const response=await nexrideApiFetch("/api/trip-share",{
    method:"POST",body:JSON.stringify({tripId,role,minutes}),cache:"no-store",
   });
   const body=await response.json().catch(()=>({})) as {
    status?:string;id?:string;url?:string;expiresAt?:string;
   };
   if(!response.ok||body.status!=="ready"||!body.url||!body.id||!body.expiresAt){
    setStatus(response.status===429?"Please wait a few minutes before creating another link.":"We couldn't verify an active trip for sharing. Reopen your active trip and try again.");
    return;
   }
   setCurrent({id:body.id,url:body.url,expiresAt:body.expiresAt});
   setStatus("Private link created. Share it only with someone you trust.");
   await refresh();
   // Triggering platform share directly after creating is not guaranteed to
   // retain the browser gesture on every Android WebView. Keep a clear
   // user-initiated share button for a reliable native chooser.
  }catch{setStatus("Connection unavailable. No trip link was created.");}
  finally{setBusy(false);}
 };
 const share=async()=>{
  if(!current)return;
  const result=await shareNexRideTripLink(current.url);
  setStatus(result==="shared"?"Device share sheet opened. Only the recipient you select receives the link."
    : result==="copied"?"Link copied. Send it only to someone you trust."
    : result==="cancelled"?"Sharing cancelled.": "Native sharing isn't available; you can manually copy the link below.");
 };
 const copy=async()=>{
  if(!current)return;
  try{await navigator.clipboard.writeText(current.url);setStatus("Link copied.");}
  catch{setStatus("Clipboard unavailable. Select and copy the link below.");}
 };
 const revoke=async(id:string)=>{
  if(revokeBusy)return;
  setRevokeBusy(id);setStatus("");
  try {
   const response=await nexrideApiFetch("/api/trip-share",{method:"DELETE",
    body:JSON.stringify({id}),cache:"no-store"});
   if(!response.ok){setStatus("We couldn't stop sharing. Please try again.");return;}
   if(current?.id===id)setCurrent(null);
   setStatus("Sharing stopped. This link no longer provides live trip details.");
   await refresh();
  }catch{setStatus("Could not reach Biloo to stop sharing. Try again online.");}
  finally{setRevokeBusy(null);}
 };
 const activeLinks=links.filter(link=>!link.revoked_at&&Date.parse(link.expires_at)>Date.now());
 return <section className="nr-share-panel" aria-label="Secure live trip sharing">
  <div className="nr-share-note">
   <Icon name="share" size={20}/>
   <div><strong>Private live trip sharing</strong>
    <p>Choose a trusted contact in your phone's share sheet. The link shows trip milestones and recent Driver GPS only. Anyone holding it can view the trip until you revoke it or it expires.</p></div>
  </div>
  {!tripId||!userId ? (
   <p className="nr-share-offline">No verified active trip is available. Sign in and open an active trip before creating a live link.</p>
  ):!online?<p className="nr-share-offline">You're offline. New links and revocation require a connection. Previously created links remain valid until revoked, expired, or the trip ends.</p>:null}
  <label className="nr-share-lifetime">Link expiration
   <select value={minutes} onChange={e=>setMinutes(Number(e.target.value) as 15|30|60)}>
    <option value={15}>15 minutes</option><option value={30}>30 minutes</option>
    <option value={60}>60 minutes</option>
   </select>
  </label>
  <button type="button" className="nr-share-primary" disabled={!available||busy}
   onClick={()=>void create()}><Icon name="share" size={18}/>{busy?"Verifying your trip…":"Create private live link"}</button>
  {current&&<div className="nr-share-current">
   <strong>Ready to share</strong>
   <p>Expires {new Date(current.expiresAt).toLocaleTimeString()}</p>
   <input aria-label="Private trip sharing URL" readOnly value={current.url} onFocus={e=>e.target.select()}/>
   <div className="nr-share-buttons">
    <button onClick={()=>void share()}>Share with contact</button>
    <button onClick={()=>void copy()}>Copy link</button>
    <button className="danger" disabled={!!revokeBusy||!online} onClick={()=>void revoke(current.id)}>Stop sharing</button>
   </div>
  </div>}
  {activeLinks.length>0&&<div className="nr-share-active-list">
   <strong>Active links ({activeLinks.length})</strong>
   {activeLinks.map(link=><div key={link.id} className="nr-share-active-item">
    <span>Created {new Date(link.created_at).toLocaleTimeString()} · expires {new Date(link.expires_at).toLocaleTimeString()}</span>
    <button disabled={!!revokeBusy||!online} onClick={()=>void revoke(link.id)}>
     {revokeBusy===link.id?"Stopping…":"Revoke"}
    </button>
   </div>)}
  </div>}
  {status&&<p className="nr-share-status" role="status" aria-live="polite">{status}</p>}
  <p className="nr-share-privacy">Biloo does not automatically message trusted contacts. Sharing is your choice. Link recipients do not see phone numbers, account documents, or payment records.</p>
 </section>;
}

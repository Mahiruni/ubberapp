"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export type RiderMapAvatar = { preset: number; skin: string; outfit: string; hair: string };
export const AVATAR_EVENT = "biloo:rider-map-avatar";
const skins = ["#9b5f40","#c98761","#e6b48c","#75442f"];
const outfits = ["#123c6b","#176c9b","#e3ad32","#356c65"];
const hairs = ["#211a19","#4b3024","#161d2c","#694431"];
export const defaultAvatar: RiderMapAvatar = {preset:1,skin:skins[0],outfit:outfits[0],hair:hairs[0]};
const valid = (v: unknown): v is RiderMapAvatar => {
  if (!v || typeof v !== "object") return false;
  const a=v as RiderMapAvatar;
  return Number.isInteger(a.preset)&&a.preset>=1&&a.preset<=12&&skins.includes(a.skin)&&outfits.includes(a.outfit)&&hairs.includes(a.hair);
};
export function avatarMarkup(a:RiderMapAvatar) {
  // Layered gradients and shadow produce a lightweight dimensional character without WebGL overhead.
  return `<svg viewBox="0 0 80 112" width="62" height="86" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><linearGradient id="shirt" x1="0" x2="1"><stop stop-color="#ffffff" stop-opacity=".35"/><stop offset=".45" stop-color="${a.outfit}"/><stop offset="1" stop-color="#071d36"/></linearGradient><radialGradient id="skin"><stop stop-color="#ffe1b3"/><stop offset="1" stop-color="${a.skin}"/></radialGradient></defs>
  <ellipse cx="40" cy="106" rx="28" ry="5" fill="#092e58" opacity=".25"/>
  <path d="M25 67h13l-3 33H23zm18 0h13l2 33H45z" fill="#1b3455"/>
  <path d="M23 98h15v7H18q-2-4 5-7m23 0h13l5 7H45z" fill="#f2f6fb"/>
  <path d="M26 42Q40 34 54 42L60 73H20Z" fill="url(#shirt)" stroke="#153b61" stroke-width="1.5"/>
  <path d="M26 44Q18 44 15 53L9 72l9 3 12-23m24-8q8 0 11 9l7 19-9 3-12-23" fill="${a.outfit}" stroke="#163f69" stroke-width="1.5"/>
  <path d="M9 71l9 3-2 8q-5 4-9-2zm54 3 9-3 2 9q-4 6-9 2z" fill="${a.skin}"/>
  <rect x="35" y="32" width="10" height="12" rx="4" fill="${a.skin}"/>
  <ellipse cx="40" cy="22" rx="16" ry="19" fill="url(#skin)"/>
  <path d="M24 24Q17 1 39 2q22-2 18 22-5-5-6-13-14 9-27 13" fill="${a.hair}"/>
  <circle cx="34" cy="23" r="1.3" fill="#1d2530"/><circle cx="46" cy="23" r="1.3" fill="#1d2530"/>
  <path d="M36 31q4 3 8 0" stroke="#653b31" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  </svg>`;
}
export function getCachedAvatar():RiderMapAvatar {
  if(typeof window==="undefined")return defaultAvatar;
  try { const value=JSON.parse(localStorage.getItem("biloo:rider-avatar")||"null");return valid(value)?value:defaultAvatar; }catch{return defaultAvatar;}
}
export function publishAvatar(a:RiderMapAvatar){localStorage.setItem("biloo:rider-avatar",JSON.stringify(a));window.dispatchEvent(new CustomEvent(AVATAR_EVENT,{detail:a}));}
export function RiderMapAvatarPicker(){
 const [selected,setSelected]=useState<RiderMapAvatar>(defaultAvatar);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState("");
 useEffect(()=>{setSelected(getCachedAvatar());let active=true;void (async()=>{
 const {data:{user}}=await supabase.auth.getUser();if(!user||!active)return;
 const {data,error}=await supabase.from("rider_map_avatars").select("preset,skin,outfit,hair").eq("user_id",user.id).maybeSingle();
 if(!error&&valid(data)&&active){setSelected(data);publishAvatar(data);}
 })();return()=>{active=false};},[]);
 const save=async()=>{setSaving(true);setMessage("");try{
 const {data:{user},error}=await supabase.auth.getUser();if(error||!user)throw Error("Sign in to sync your avatar.");
 const {error:writeError}=await supabase.from("rider_map_avatars").upsert({user_id:user.id,...selected},{onConflict:"user_id"});
 if(writeError)throw writeError;
 publishAvatar(selected);setMessage("Saved! Your map avatar syncs with your account.");
 }catch(e){setMessage(e instanceof Error?e.message:"Could not save avatar.");}finally{setSaving(false);}};
 return <section aria-label="Customize map avatar" style={{padding:16,borderRadius:18,background:"#eef4fb",color:"#102d50",marginTop:12}}>
 <h3 style={{margin:"0 0 4px"}}>My 3D Map Avatar</h3><p style={{fontSize:13,margin:"0 0 12px"}}>Choose a character or customize one. This appears at your live location on the Rider map.</p>
 <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8}}>
 {Array.from({length:12},(_,i)=>{const n=i+1;const avatar={preset:n,skin:skins[i%4],outfit:outfits[Math.floor(i/4)%4],hair:hairs[(i+Math.floor(i/4))%4]};return <button key={n} type="button" aria-label={`Avatar ${n}`} aria-pressed={selected.preset===n} onClick={()=>setSelected(avatar)} style={{background:selected.preset===n?"#d5e8ff":"white",border:selected.preset===n?"2px solid #123c6b":"1px solid #cbd7e6",borderRadius:12,padding:4,minWidth:0}}><span dangerouslySetInnerHTML={{__html:avatarMarkup(avatar)}} style={{display:"block",height:72,overflow:"hidden"}}/><span style={{fontSize:11,color:"#102d50"}}>{String(n).padStart(2,"0")}</span></button>})}
 </div>
 <div style={{display:"flex",justifyContent:"center",margin:"14px 0",background:"linear-gradient(160deg,#dceaf6,#f9fbff)",borderRadius:14,padding:10}}><span dangerouslySetInnerHTML={{__html:avatarMarkup(selected)}}/></div>
 <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
 {([["Skin",skins,"skin"],["Clothes",outfits,"outfit"],["Hair",hairs,"hair"]] as const).map(([label,values,key])=><label key={key} style={{fontSize:12}}>{label}<select aria-label={label} value={selected[key]} onChange={e=>setSelected(v=>({...v,[key]:e.target.value}))} style={{width:"100%",padding:8,borderRadius:8,background:"white",color:"#102d50"}}>{values.map((v,i)=><option key={v} value={v}>{label} {i+1}</option>)}</select></label>)}
 </div>
 <button type="button" disabled={saving} onClick={()=>void save()} style={{marginTop:14,width:"100%",padding:12,borderRadius:12,background:"#123c6b",color:"white",fontWeight:700}}>{saving?"Saving…":"Save my map avatar"}</button>
 {message&&<p role="status" style={{fontSize:12}}>{message}</p>}
 </section>;
}

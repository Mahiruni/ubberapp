'use client';
import { useEffect, useState } from 'react';
import { AVATAR_HAIR, AVATAR_OUTFITS, AVATAR_SKINS, DEFAULT_MAP_AVATAR, loadMapAvatar, mapAvatarSvg, saveMapAvatar, type MapAvatar } from '../../lib/biloo-rider-map-avatar';
import './rider-map-avatar-studio.css';
export function RiderMapAvatarStudio({onClose}:{onClose:()=>void}) {
 const [design,setDesign]=useState<MapAvatar>(DEFAULT_MAP_AVATAR);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{let active=true;loadMapAvatar().then(a=>{if(active)setDesign(a)}).catch(()=>{if(active)setMessage('Sign in to sync your avatar across devices.')});return()=>{active=false}},[]);
 const update=(change:Partial<MapAvatar>)=>setDesign(a=>({...a,...change}));
 return <section className="biloo-avatar-studio" aria-label="Design your map avatar">
 <header><div><h3>My Map Avatar</h3><p>Choose from 20 characters or design your own. Your avatar follows your location on the Rider map.</p></div><button type="button" onClick={onClose} aria-label="Close avatar studio">✕</button></header>
 <div className="biloo-avatar-preview"><div className="biloo-avatar-map-grid"/><div className="biloo-avatar-halo"/><div className="biloo-avatar-character" dangerouslySetInnerHTML={{__html:mapAvatarSvg(design)}}/><span>Map preview</span></div>
 <h4>20 character styles</h4><div className="biloo-avatar-collection">{Array.from({length:20},(_,i)=><button key={i} type="button" aria-label={`Choose character ${i+1}`} aria-pressed={design.preset===i} onClick={()=>update({preset:i,skin:i%5,hair:Math.floor(i/2)%5,outfit:i%6})}><span dangerouslySetInnerHTML={{__html:mapAvatarSvg({preset:i,skin:i%5,hair:Math.floor(i/2)%5,outfit:i%6})}}/><small>{String(i+1).padStart(2,'0')}</small></button>)}</div>
 <h4>Make it yours</h4>
 <div className="biloo-avatar-customize">{([{label:'Skin tone',key:'skin',colors:AVATAR_SKINS},{label:'Hair color',key:'hair',colors:AVATAR_HAIR},{label:'Outfit',key:'outfit',colors:AVATAR_OUTFITS}] as const).map(group=><fieldset key={group.key}><legend>{group.label}</legend><div>{group.colors.map((color,i)=><button key={color} type="button" aria-label={`${group.label} ${i+1}`} aria-pressed={design[group.key]===i} style={{background:color}} onClick={()=>update({[group.key]:i})}/>)}</div></fieldset>)}</div>
 {message&&<p role="status">{message}</p>}
 <button className="biloo-avatar-save" type="button" disabled={saving} onClick={async()=>{setSaving(true);setMessage('');try{await saveMapAvatar(design);setMessage('Saved! Your Rider map avatar is synced.')}catch(e){setMessage(e instanceof Error?e.message:'Could not save avatar. Please retry.')}finally{setSaving(false)}}}>{saving?'Saving…':'Save my avatar'}</button>
 </section>;
}

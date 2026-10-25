"use client";
import { useParams } from "next/navigation";
import { useCallback,useEffect,useState } from "react";
import { SharedTripMap,type SharedDriverPoint } from "../../../../components/nexride/shared-trip-map";
import type { DriverMapAvatar } from "../../../../lib/biloo-driver-map-avatar";
import "./share.css";

type LiveData={
 status:"active";
 trip:{stage:string;pickup:string;destination:string;category:string};
 driverLocation:SharedDriverPoint|null;
 driverAvatar?:DriverMapAvatar;
 expiresAt:string;lastCheckedAt:string;
};
type State="loading"|"active"|"ended"|"unavailable";
const statusText:Record<string,string>={
 accepted:"Driver on the way",arrived_pickup:"Driver arrived at pickup",in_trip:"On the way to destination",
};
export default function PrivateTripViewer(){
 const params=useParams<{token:string}>();
 const token=typeof params.token==="string"?params.token:"";
 const [data,setData]=useState<LiveData|null>(null);
 const [state,setState]=useState<State>("loading");
 const [lastUpdated,setLastUpdated]=useState<number|null>(null);
 const refresh=useCallback(async(signal?:AbortSignal)=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(token)){setData(null);setState("ended");return;}
  try{
   const response=await fetch("/api/trip-share/public/"+encodeURIComponent(token),{
    method:"GET",cache:"no-store",signal,headers:{Accept:"application/json"},
   });
   if(response.status===410||response.status===404){setData(null);setState("ended");return;}
   if(!response.ok){setData(null);setState("unavailable");return;}
   const result=await response.json() as LiveData;
   if(signal?.aborted)return;
   if(result.status!=="active"){setData(null);setState("ended");return;}
   setData(result);setState("active");setLastUpdated(Date.now());
  }catch{if(!signal?.aborted){setData(null);setState("unavailable");}}
 },[token]);
 useEffect(()=>{
  const controller=new AbortController();
  void refresh(controller.signal);
  const poll=window.setInterval(()=>{if(document.visibilityState==="visible")void refresh(controller.signal);},12000);
  const resume=()=>{if(document.visibilityState==="visible")void refresh(controller.signal);};
  const online=()=>void refresh(controller.signal);
  document.addEventListener("visibilitychange",resume);
  window.addEventListener("online",online);
  return ()=>{controller.abort();window.clearInterval(poll);
   document.removeEventListener("visibilitychange",resume);window.removeEventListener("online",online);};
 },[refresh]);
 const expired=data?Date.parse(data.expiresAt)<=Date.now():false;
 const live=state==="active"&&!expired&&data;
 const point=live && lastUpdated && Date.now()-lastUpdated<60000?live.driverLocation:null;
 const details=data?.trip;
 return <main className="nr-public-share">
  <div className="nr-public-share-inner">
   <header className="nr-public-share-head">
    <div><span className="nr-public-eyebrow">BILOO · TRUSTED TRIP LINK</span>
     <h1>Biloo</h1><p>Live journey updates for someone you trust</p></div>
    <span className="nr-public-status">{live?"● LIVE":state==="loading"?"Checking…":"Not live"}</span>
   </header>
   {state==="loading"?<section className="nr-public-share-card" role="status">Verifying this private trip link…</section>:
    !live?<section className="nr-public-share-card" role="status">
      <h2>{state==="unavailable"?"Connection unavailable":"This trip link has ended"}</h2>
      <p>{state==="unavailable"?"Please check your internet connection and try again.": "The trip finished, the link expired, or sharing was stopped. Live trip details are no longer available."}</p>
      {state==="unavailable"&&<button className="nr-public-primary" onClick={()=>void refresh()}>Try again</button>}
    </section>:
    <>
     <section className="nr-public-share-card">
      <span className="nr-public-eyebrow">CURRENT TRIP STATUS</span>
      <h2>{statusText[details?.stage||""]||"Trip in progress"}</h2>
      <p>This is a private, time-limited view. GPS is displayed only when a verified recent location is available.</p>
      <div className="nr-public-route">
       <div><span className="nr-public-pin">●</span><span><small>PICKUP</small><strong>{details?.pickup||"Pickup location not available"}</strong></span></div>
       <div><span className="nr-public-pin last">●</span><span><small>DESTINATION</small><strong>{details?.destination||"Destination not available"}</strong></span></div>
      </div>
      <SharedTripMap point={point||null} avatar={live.driverAvatar}/>
      <p className="nr-public-gps">{point
       ? "Latest verified Driver GPS: "+new Date(point.updatedAt).toLocaleTimeString()+ " · accuracy ~"+point.accuracyMeters+" m"
       : "Current Driver location unavailable or stale. Biloo does not estimate a position."}</p>
      {point&&<a className="nr-public-map-link"
        target="_blank" rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        href={`https://www.google.com/maps/search/?api=1&query=${point.lat}%2C${point.lng}`}>Open this location in Maps ↗</a>}
     </section>
     <p className="nr-public-expiry">This link expires at {new Date(live.expiresAt).toLocaleTimeString()}. Sharing ends immediately if the trip finishes or is cancelled.</p>
    </>}
   <footer>Biloo · Better Rides. A Brighter Tomorrow.</footer>
  </div>
 </main>;
}

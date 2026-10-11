"use client";

import { useEffect,useRef,useState } from "react";
import type { Map as MapboxMap,Marker as MapboxMarker } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export type SharedDriverPoint={lat:number;lng:number;updatedAt:string;accuracyMeters:number};

export function SharedTripMap({point}:{point:SharedDriverPoint|null}) {
 const node=useRef<HTMLDivElement>(null);
 const map=useRef<MapboxMap|null>(null);
 const marker=useRef<MapboxMarker|null>(null);
 const [available,setAvailable]=useState(false);
 const [unavailable,setUnavailable]=useState(false);
 useEffect(()=>{
  let disposed=false;
  if(!node.current || !process.env.NEXT_PUBLIC_MAPBOX_TOKEN){
   setUnavailable(true);return;
  }
  void import("mapbox-gl").then(({default:mapboxgl})=>{
   if(disposed||!node.current)return;
   mapboxgl.accessToken=process.env.NEXT_PUBLIC_MAPBOX_TOKEN||"";
   const next=new mapboxgl.Map({
    container:node.current,style:"mapbox://styles/mapbox/streets-v12",
    center:[38.76,9.01],zoom:12,attributionControl:true,
   });
   map.current=next;
   next.on("load",()=>{if(!disposed)setAvailable(true);});
   next.on("error",()=>{if(!disposed&&!next.loaded())setUnavailable(true);});
  }).catch(()=>{if(!disposed)setUnavailable(true);});
  return ()=>{disposed=true;marker.current?.remove();map.current?.remove();marker.current=null;map.current=null;};
 },[]);
 useEffect(()=>{
  const next=map.current;
  if(!available||!next)return;
  if(!point){marker.current?.remove();marker.current=null;return;}
  void import("mapbox-gl").then(({default:mapboxgl})=>{
   if(map.current!==next)return;
   const lngLat:[number,number]=[point.lng,point.lat];
   if(!marker.current){
    const el=document.createElement("div");
    el.className="nr-share-map-marker";
    el.setAttribute("aria-label","Latest verified Driver location");
    marker.current=new mapboxgl.Marker({element:el,anchor:"center"}).setLngLat(lngLat).addTo(next);
    next.jumpTo({center:lngLat,zoom:14.5});
   }else marker.current.setLngLat(lngLat);
  }).catch(()=>{});
 },[available,point?.lat,point?.lng]);
 return <div className="nr-share-map-container" aria-label="Live trip location map">
   <div ref={node} className="nr-share-map-canvas"/>
   {(!point||unavailable)&&<div className="nr-share-map-message" role="status">
    {unavailable?"Map unavailable; location details remain below.":"Waiting for fresh Driver GPS. No position is being guessed."}
   </div>}
 </div>;
}

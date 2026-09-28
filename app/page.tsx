'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './driver-premium.css';
import { supabase } from '../lib/supabase';

type IconName=string;
const iconPaths:Record<string,string>={home:'M3 10l9-7 9 7M5 9v11h14V9M9 20v-6h6v6',clock:'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',wallet:'M3 6h18v13H3zM16 12h5',shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',user:'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8',car:'M5 17h14M6 17l-1-5 2-5h10l2 5-1 5M7 15h.01M17 15h.01',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0-0-8 4 4 0 0 0 0 8',navigation:'M4 4l16 8-16 8 4-8-4-8',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 12H2M22 12h-2M12 4V2M12 22v-2',help:'M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3M12 17h.01',sun:'M12 3v2M12 19v2M3 12h2M19 12h2M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8',moon:'M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z',menu:'M4 6h16M4 12h16M4 18h16',arrowRight:'M5 12h14M12 5l7 7-7 7',check:'M5 12l4 4L19 6',pin:'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6',plane:'m3 11 18-8-8 18-2-7-8-3z',briefcase:'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 7h16v12H4zM4 12h16',chat:'M4 5h16v11H8l-4 4z',phone:'M6 3l3 1-1 4-2 1a15 15 0 0 0 7 7l1-2 4-1 1 3a2 2 0 0 1-2 2C10 18 6 14 3 7a2 2 0 0 1 3-4z',share:'M18 8a3 3 0 1 0-2.8-4M6 14a3 3 0 1 0 2.8 4M8.7 13.2l6.6-3.4M8.7 10.8l6.6 3.4',emergency:'M12 3v10M12 17h.01M6 7a9 9 0 0 0 0 10M18 7a9 9 0 0 1 0 10',file:'M6 3h9l3 3v15H6zM15 3v4h4M9 12h6M9 16h6',money:'M3 6h18v12H3zM12 8v8M7 12h.01M17 12h.01',card:'M3 6h18v12H3zM3 10h18',layers:'m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',locate:'M12 2v4M12 18v4M2 12h4M18 12h4M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',logout:'M10 17l5-5-5-5M15 12H3M21 19V5a2 2 0 0 0-2-2h-5'};
function Icon({name,size=20}:{name:IconName;size?:number}){return <svg className="lucide-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={iconPaths[name]||iconPaths.help}/></svg>}

type Ride={id:string;name:string;icon:IconName;eta:string;price:number;seats:number;note:string};
type Screen='home'|'rides'|'trip'|'history'|'wallet'|'safety'|'profile'|'driver';
type DriverTab='overview'|'requests'|'earnings'|'preferences'|'safety'|'account';
const rides:Ride[]=[
{id:'economy',name:'Economy',icon:'car',eta:'3 min',price:185,seats:4,note:'Everyday rides'},
{id:'comfort',name:'Comfort',icon:'shield',eta:'5 min',price:265,seats:4,note:'Newer, quieter cars'},
{id:'premium',name:'Premium',icon:'star',eta:'7 min',price:420,seats:4,note:'Top-rated drivers'},
{id:'xl',name:'XL',icon:'users',eta:'6 min',price:340,seats:6,note:'Up to 6 passengers'}
];
const history=[{date:'Today · 08:42',from:'Bole Atlas',to:'Kazanchis',price:265,status:'Completed'},{date:'Yesterday · 18:10',from:'CMC',to:'Bole Airport',price:410,status:'Completed'},{date:'Sep 24 · 12:05',from:'Piassa',to:'4 Kilo',price:190,status:'Completed'}];

export default function Home(){
 const[screen,setScreen]=useState<Screen>('home'),[destination,setDestination]=useState(''),[pickup,setPickup]=useState('Current location'),[selected,setSelected]=useState<Ride>(rides[0]),[trip,setTrip]=useState(false),[driverOnline,setDriverOnline]=useState(false),[dark,setDark]=useState(false),[lang,setLang]=useState<'EN'|'AM'>('EN'),[notice,setNotice]=useState(''),[coords,setCoords]=useState({lat:9.01,lng:38.76}),[stop,setStop]=useState(false),[safetyShared,setSafetyShared]=useState(false),[recording,setRecording]=useState(false),[blocked,setBlocked]=useState(false),[online,setOnline]=useState(true),[locationFresh,setLocationFresh]=useState(false),[searchQuery,setSearchQuery]=useState(''),[onboarding,setOnboarding]=useState<'rider'|'driver'|null>(null),[onboardStep,setOnboardStep]=useState(0),[profileName,setProfileName]=useState(''),[driverDocStep,setDriverDocStep]=useState(0),[driverVerified,setDriverVerified]=useState(false),[backendTripId,setBackendTripId]=useState<string|null>(null),[backendState,setBackendState]=useState<string|null>(null),[authReady,setAuthReady]=useState(false),[dispatchTripId,setDispatchTripId]=useState<string|null>(null);
 const[driverTab,setDriverTab]=useState<DriverTab>('overview'),[requestOpen,setRequestOpen]=useState(true),[requestAccepted,setRequestAccepted]=useState(false),[driverStage,setDriverStage]=useState<'pickup'|'wait'|'trip'|'complete'>('pickup'),[earnPeriod,setEarnPeriod]=useState('Today'),[area,setArea]=useState('All Addis'),[destinationFilter,setDestinationFilter]=useState(false),[quietHours,setQuietHours]=useState(false),[ridePrefs,setRidePrefs]=useState(['Economy','Comfort','XL']),[docs,setDocs]=useState(false),[reportOpen,setReportOpen]=useState(false);
 const locationWatch=useRef<number|null>(null);
 const originalText=useRef<WeakMap<Node,string>>(new WeakMap());
 const cacheSet=useCallback((key:string,value:unknown)=>{try{localStorage.setItem('nexride:'+key,JSON.stringify(value))}catch{}},[]);
 const cacheGet=useCallback(<T,>(key:string,fallback:T):T=>{try{const raw=localStorage.getItem('nexride:'+key);return raw?JSON.parse(raw) as T:fallback}catch{return fallback}},[]);
 useEffect(()=>{
   const savedCoords=cacheGet('last-location',{lat:9.01,lng:38.76});
   setCoords(savedCoords);
   setDriverOnline(cacheGet('driver-online',false));
   const completed=cacheGet('onboarding-complete',false); if(!completed){setOnboarding('rider');setOnboardStep(0)}
   setOnline(navigator.onLine);
   if(!navigator.geolocation){setLocationFresh(false);}
   const onOnline=()=>{setOnline(true);toast('Connection restored · NexRide is synced')};
   const onOffline=()=>{setOnline(false);toast('Weak connection · cached essentials remain available')};
   window.addEventListener('online',onOnline); window.addEventListener('offline',onOffline);
   if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
   return()=>{window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline)};
 },[cacheGet]);
 useEffect(()=>{
   const id=window.setTimeout(()=>setSearchQuery(destination.trim().toLowerCase()),120);
   return()=>window.clearTimeout(id);
 },[destination]);
 useEffect(()=>{
   if(!navigator.geolocation)return;
   const read=(p:GeolocationPosition)=>{const next={lat:p.coords.latitude,lng:p.coords.longitude};setCoords(next);setLocationFresh(true);cacheSet('last-location',next)};
   navigator.geolocation.getCurrentPosition(read,()=>setLocationFresh(false),{enableHighAccuracy:false,maximumAge:60000,timeout:5000});
   if(trip){
     locationWatch.current=navigator.geolocation.watchPosition(read,()=>setLocationFresh(false),{enableHighAccuracy:true,maximumAge:5000,timeout:8000});
   }
   return()=>{if(locationWatch.current!==null){navigator.geolocation.clearWatch(locationWatch.current);locationWatch.current=null}};
 },[trip,cacheSet]);
 useEffect(()=>{cacheSet('last-destination',destination)},[destination,cacheSet]);
 useEffect(()=>{cacheSet('selected-ride',selected.id)},[selected,cacheSet]);
 const fare=useMemo(()=>selected.price+(stop?70:0),[selected,stop]);
 const toast=(s:string)=>{setNotice(s);window.setTimeout(()=>setNotice(''),2600)};
 const amharic:Record<string,string>={
 'Ride':'ጉዞ','Trips':'ጉዞዎች','Wallet':'የኪስ ቦርሳ','Safety':'ደህንነት','Rider':'ተሳፋሪ','Driver workspace':'የአሽከርካሪ የስራ ቦታ','Your ride':'ጉዞዎ','Good morning, Mahir':'እንደምን አደርክ፣ ማሂር','Help':'እገዛ','Limited connection':'የኢንተርኔት ግንኙነት ደካማ ነው','Essentials stay available. Ride requests will retry when you’re back online.':'አስፈላጊ ነገሮች ይገኛሉ። ግንኙነቱ ሲመለስ የጉዞ ጥያቄዎች እንደገና ይላካሉ።','Where to?':'ወዴት እንሂድ?','READY WHEN YOU ARE':'ሲዘጋጁ እኛም ዝግጁ ነን','Current location':'ያሉበት ቦታ','Search destination':'መድረሻ ይፈልጉ','No saved places match that search.':'ከፍለጋዎ ጋር የሚዛመድ የተቀመጠ ቦታ የለም።','Airport':'አየር ማረፊያ','Home':'ቤት','Work':'ስራ','Choose a ride':'ጉዞ ይምረጡ','See all':'ሁሉንም ይመልከቱ','Estimated total':'ግምታዊ ጠቅላላ','Includes estimated fees':'ግምታዊ ክፍያዎችን ያካትታል','Confirm':'አረጋግጥ','Schedule for later':'ለሌላ ጊዜ ያቅዱ','Choose your ride':'ጉዞዎን ይምረጡ','Transparent pricing. No surprises.':'ግልጽ ዋጋ። ያልተጠበቀ ተጨማሪ ክፍያ የለም።','Your trips':'የጉዞ ታሪክ','Receipts and ride history, all in one place.':'ደረሰኞችና የጉዞ ታሪክዎ በአንድ ቦታ።','Completed':'ተጠናቋል','Receipt':'ደረሰኝ','Pay your way, with clear receipts every time.':'በመረጡት መንገድ ይክፈሉ፤ ግልጽ ደረሰኝ ሁልጊዜ።'
};
 // Existing application implementation continues below unchanged.

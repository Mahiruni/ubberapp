/* Presentation bridge: exact same-origin + parent checks, no credentials in messages. */
(() => {
 if (window.parent === window || !new URLSearchParams(location.search).has('embedded')) return;
 const params = new URLSearchParams(location.search), liveRequested = params.has('live'), origin = location.origin;
 let subscription, onDisconnect, onConnect, initialized = false, sequence = 0;
 const pending = new Map();
 const post = message => parent.postMessage(message, origin);
 function request(method,input){return new Promise((resolve,reject)=>{const requestId=String(++sequence),timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Request timed out'));},20000);pending.set(requestId,{resolve,reject,timer});post({type:'nexride:request',requestId,method,input});});}
 function geographicMap(){
  let map,car,pickup,destination,line,accuracy,lastFix,frame=0,target,tileError;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const point=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
  const current=(booking,context)=>context?.trackingCurrent??(['approaching','arrived','in_trip'].includes(booking.status)&&navigator.onLine&&booking.tracking&&Date.now()-booking.tracking.updatedAt>=-5000&&Date.now()-booking.tracking.updatedAt<45000);
  const stop=()=>{cancelAnimationFrame(frame);frame=0;if(target&&car)car.setLatLng(target);target=null;};
  const icon=kind=>L.divIcon({className:'nexride-map-pin '+kind,html:kind==='vehicle'?'↗':kind==='destination'?'D':'P',iconSize:[32,32],iconAnchor:[16,16]});
  let fitted=false;
  const fitOptions=()=>innerWidth<=760?{paddingTopLeft:[25,190],paddingBottomRight:[25,(document.querySelector('.ride-panel')?.getBoundingClientRect().height||300)+25],maxZoom:15}:{paddingTopLeft:[35,170],paddingBottomRight:[425,40],maxZoom:15};
  return {
   mountMap(container){
    const surface=document.createElement('div');surface.className='nexride-geographic-map';container.prepend(surface);
    map=L.map(surface,{zoomControl:false,attributionControl:true}).setView([9.01,38.76],13);
    const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(map);
    tileError=document.createElement('div');tileError.className='nexride-map-error';tileError.textContent='Map tiles unavailable · markers show received coordinates';tileError.hidden=true;surface.append(tileError);
    tiles.on('tileerror',()=>tileError.hidden=false);tiles.on('load',()=>{});
    new ResizeObserver(()=>{map.invalidateSize();}).observe(surface);
    reduced.addEventListener('change',()=>{if(reduced.matches)stop();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
   },
   updateMap(booking,context={}){
    if(!map)return;
    const marker=(existing,p,kind)=>{if(!point(p)){existing?.remove();return null;}if(!existing)existing=L.marker([p.lat,p.lng],{icon:icon(kind),keyboard:true,title:kind==='destination'?'Destination':kind==='vehicle'?'Last reported vehicle position':'Pickup'}).addTo(map);else existing.setLatLng([p.lat,p.lng]);return existing;};
    pickup=marker(pickup,booking.pickup,'pickup');destination=marker(destination,booking.destination,'destination');
    const route=booking.route?.points||booking.tracking?.route;
    line?.remove();line=null;if(Array.isArray(route)&&route.length>1&&route.every(point))line=L.polyline(route.map(p=>[p.lat,p.lng]),{color:booking.status==='in_trip'?'#062b47':'#00a976',weight:5}).addTo(map);
    const fix=booking.tracking,active=['approaching','arrived','in_trip'].includes(booking.status);
    if(!active||!point(fix)||fix.driverId!==booking.driver?.id){stop();car?.remove();car=null;accuracy?.remove();accuracy=null;lastFix=null;}
    else{
     const next=[fix.lat,fix.lng],fresh=current(booking,context),newer=!lastFix||fix.updatedAt>lastFix.updatedAt,same=lastFix?.driverId===fix.driverId;
     if(!fresh||context.connected===false)stop();
     if(!car){car=marker(null,fix,'vehicle');lastFix={...fix};}
     else if(newer||!same){
      const animate=newer&&same&&fresh&&Date.now()-lastFix.updatedAt<45000&&!reduced.matches&&context.connected!==false;
      stop();if(animate){const from=car.getLatLng(),start=performance.now();target=next;const step=t=>{const progress=Math.min(1,(t-start)/650),ease=progress*progress*(3-2*progress);car.setLatLng([from.lat+(next[0]-from.lat)*ease,from.lng+(next[1]-from.lng)*ease]);if(progress<1)frame=requestAnimationFrame(step);else{frame=0;target=null;}};frame=requestAnimationFrame(step);}else car.setLatLng(next);
      lastFix={...fix};
     }
     accuracy?.remove();accuracy=null;if(Number.isFinite(fix.accuracyMeters)&&fix.accuracyMeters>0)accuracy=L.circle(next,{radius:fix.accuracyMeters,color:'#517684',weight:1,fillOpacity:.08}).addTo(map);
    }
    const points=[booking.pickup,booking.destination,fix,...(route||[])].filter(point).map(p=>[p.lat,p.lng]);if(!fitted&&points.length){map.fitBounds(points,fitOptions());fitted=true;}
   },
   recenterMap(){const points=[pickup,destination,car].filter(Boolean).map(p=>p.getLatLng());if(points.length)map.fitBounds(points,fitOptions());}
  };
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==origin||event.source!==parent||!event.data||typeof event.data!=='object')return;
  const message=event.data;
  if(message.type==='nexride:ping'){post({type:'nexride:ready'});return;}
  if(message.type==='nexride:response'){const p=pending.get(message.requestId);if(!p)return;clearTimeout(p.timer);pending.delete(message.requestId);message.error?p.reject(Error(message.error)):p.resolve(message.result);return;}
  if(message.type==='nexride:snapshot'){subscription?.(message.snapshot);return;}
  if(message.type==='nexride:connection'){message.connected?onConnect?.():onDisconnect?.();return;}
  if(message.type!=='nexride:initialize'||initialized||!!message.live!==liveRequested)return;
  initialized=true;
  const api=window.NexRideCompletion||window.NexRideTrip||window.NexRide;
  if(message.live){
   if(typeof message.tripId!=='string'||!message.tripId)return;
   const service={bookingId:message.tripId,tripId:message.tripId,subscribe(next,lost,connected){subscription=next;onDisconnect=lost;onConnect=connected;post({type:'nexride:subscribed'});return()=>{subscription=null;};},submitRating:input=>request('submitRating',input),sendMessage:input=>request('sendMessage',input),getCancellationQuote:input=>request('getCancellationQuote',input)};
   if(!window.NexRideCompletion&&window.L)Object.assign(service,geographicMap());
   await api.connect(service);
  }else{api.setPreviewTrip?.(message.preview);post({type:'nexride:subscribed'});}
  document.documentElement.classList.remove('nexride-awaiting');
 });
 post({type:'nexride:ready'});
})();

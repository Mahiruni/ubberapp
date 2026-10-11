/**
 * NexRide Driver route-aware spoken guidance.
 *
 * Mapbox returns each maneuver's start coordinate, while step.distanceMeters
 * describes the FOLLOWING leg. Measure distance along the received route
 * geometry instead of reading the first step or that leg length.
 * Pure functions allow deterministic GPS/voice regression tests.
 */
export type NavPoint = { lat: number; lng: number };
export type NavStep = {
  instruction: string;
  maneuver: NavPoint;
  type?: string;
  modifier?: string;
  roadName?: string;
};
export type RouteManeuver = {
  key: string;
  step: NavStep;
  distanceMeters: number;
  offRouteMeters: number;
};
export type VoiceBand = "advance" | "near" | "now";
export type NavigationLanguage = "en" | "am";
type RouteMeasure = { distanceMeters: number; progressMeters: number };

const rad = Math.PI / 180;
const earth = 6371000;
const valid = (p: NavPoint | null | undefined): p is NavPoint =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

function meters(a: NavPoint,b: NavPoint) {
  const lat1=a.lat*rad,lat2=b.lat*rad;
  const deltaLat=lat2-lat1, deltaLng=(b.lng-a.lng)*rad;
  const value=Math.sin(deltaLat/2)**2 +
    Math.cos(lat1)*Math.cos(lat2)*Math.sin(deltaLng/2)**2;
  return earth*2*Math.asin(Math.min(1,Math.sqrt(value)));
}

function projectOntoRoute(polyline: NavPoint[], point: NavPoint): RouteMeasure | null {
  if (!valid(point) || polyline.length < 2) return null;
  let along=0, bestDistance=Infinity, progress=0;
  const metersPerLng=Math.cos(point.lat*rad)*earth*rad;
  const metersPerLat=earth*rad;
  for(let i=0;i<polyline.length-1;i++){
    const a=polyline[i],b=polyline[i+1];
    if(!valid(a)||!valid(b))return null;
    const dx=(b.lng-a.lng)*metersPerLng,dy=(b.lat-a.lat)*metersPerLat;
    const px=(point.lng-a.lng)*metersPerLng,py=(point.lat-a.lat)*metersPerLat;
    const length2=dx*dx+dy*dy;
    const fraction=length2>0 ? Math.max(0,Math.min(1,(px*dx+py*dy)/length2)) : 0;
    const distance=Math.hypot(px-fraction*dx,py-fraction*dy);
    if(distance<bestDistance){bestDistance=distance;progress=along+Math.sqrt(length2)*fraction;}
    along+=Math.sqrt(length2);
  }
  return {distanceMeters:bestDistance,progressMeters:progress};
}

export function nextNexRideManeuver(
  polyline: NavPoint[],
  steps: NavStep[],
  position: NavPoint | null,
  maxRouteDeviationMeters=75,
): RouteManeuver | null {
  if(!position || !valid(position)||steps.length===0)return null;
  const progress=projectOntoRoute(polyline,position);
  if(!progress || progress.distanceMeters>maxRouteDeviationMeters)return null;
  const firstDistance=meters(polyline[0],position);
  for(let i=0;i<steps.length;i++){
    const step=steps[i];
    if(!valid(step.maneuver))continue;
    const projected=projectOntoRoute(polyline,step.maneuver);
    if(!projected || projected.distanceMeters>120)continue;
    if(i===0 && (step.type==="depart" || step.type==="notification") && firstDistance<200)continue;
    const ahead=projected.progressMeters-progress.progressMeters;
    // A maneuver behind the vehicle is no longer a valid spoken command.
    if(ahead < -20)continue;
    const type=String(step.type||"turn").toLowerCase();
    const modifier=String(step.modifier||"").toLowerCase();
    const key=[type,modifier,
      step.maneuver.lat.toFixed(4),step.maneuver.lng.toFixed(4)].join(":");
    return { key,step,distanceMeters:Math.max(0,Math.round(ahead)),
      offRouteMeters:Math.round(progress.distanceMeters) };
  }
  return null;
}

/** Traffic-safe cues at most three times per physical maneuver. */
export function nexrideVoiceBand(distanceMeters:number):VoiceBand|null {
  if(!Number.isFinite(distanceMeters)||distanceMeters<0)return null;
  if(distanceMeters<=35)return "now";
  if(distanceMeters<=115)return "near";
  if(distanceMeters<=350)return "advance";
  return null;
}

export function validVoiceFix(
  fix:{accuracy:number|null;timestamp:number}|null,
  gpsState:string, now=Date.now(),
):boolean {
  return gpsState==="fresh" && !!fix &&
    Number.isFinite(fix.timestamp) && fix.timestamp<=now+5000 &&
    now-fix.timestamp<=15000 &&
    (fix.accuracy===null || (Number.isFinite(fix.accuracy) && fix.accuracy<=55));
}

function direction(step:NavStep, language:NavigationLanguage):string {
  const type=(step.type||"").toLowerCase(),mod=(step.modifier||"").toLowerCase();
  if(language==="am"){
    if(type==="arrive")return "መድረሻዎ ከፊት ነው";
    if(type==="roundabout"||type==="rotary"||type==="roundabout turn")return "በክብ መንገዱ ይቀጥሉ";
    if(type==="merge")return "ወደ መንገዱ ይቀላቀሉ";
    if(mod.includes("u-turn"))return "ዩ ተርን ያድርጉ";
    if(type==="fork"||type==="on ramp"||type==="off ramp"){
      if(mod.includes("left"))return "በግራ በኩል ይቀጥሉ";
      if(mod.includes("right"))return "በቀኝ በኩል ይቀጥሉ";
    }
    if(mod.includes("left"))return "ወደ ግራ ይታጠፉ";
    if(mod.includes("right"))return "ወደ ቀኝ ይታጠፉ";
    return "ቀጥታ ይቀጥሉ";
  }
  const instruction=step.instruction.trim();
  return instruction || "Continue on the route";
}

export function nexrideSpokenManeuver(m:RouteManeuver,band:VoiceBand,language:NavigationLanguage) {
  const cue=direction(m.step,language);
  if(band==="now")return language==="am" ? "አሁን " + cue : "Now, " + cue;
  const rounded=band==="near" ? Math.max(20,Math.round(m.distanceMeters/10)*10) :
    Math.max(100,Math.round(m.distanceMeters/50)*50);
  if(language==="am")return `ከ${rounded} ሜትር በኋላ ${cue}`;
  return `In ${rounded} meters, ${cue}`;
}

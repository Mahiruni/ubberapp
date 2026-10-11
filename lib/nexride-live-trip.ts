/** NexRide native Android live-trip bridge.
 *
 * Never start a Live Update from a saved/offline trip or a preview. Call this
 * only after a server-confirmed, user-initiated active ride. Android 16 will
 * use ProgressStyle; earlier versions use a standard notification.
 */
import { getNexRideNativeAppRole } from "./nexride-native-reliability";

export type LiveTripRole = "rider" | "driver";
export type LiveTripPayload = {
  role: LiveTripRole;
  tripId: string;
  stage: "accepted" | "arrived_pickup" | "in_trip" | "approaching" | "arrived";
  etaMinutes?: number;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Plugin = {
  update: (args:LiveTripPayload)=>Promise<{status:string}>;
  clear: (args:{tripId:string})=>Promise<void>;
  status: ()=>Promise<{android16:boolean;notificationsAllowed:boolean;activeTrip:boolean}>;
};
const posted = new Map<LiveTripRole,string>();
let pluginPromise:Promise<Plugin|null>|null=null;
async function nativePlugin():Promise<Plugin|null> {
  if(typeof window==="undefined")return null;
  if(!pluginPromise)pluginPromise=(async()=>{
    const {Capacitor,registerPlugin}=await import("@capacitor/core");
    if(!Capacitor.isNativePlatform() ||
       !Capacitor.isPluginAvailable("NexRideLiveTrip"))return null;
    return registerPlugin<Plugin>("NexRideLiveTrip");
  })().catch(()=>null);
  return pluginPromise;
}
export function validateNexRideLiveTrip(payload:LiveTripPayload):boolean {
  if(!uuid.test(payload.tripId))return false;
  if(payload.role==="driver" && !["accepted","arrived_pickup","in_trip"].includes(payload.stage))return false;
  if(payload.role==="rider" && !["approaching","arrived","in_trip"].includes(payload.stage))return false;
  return payload.etaMinutes===undefined ||
    (Number.isInteger(payload.etaMinutes) && payload.etaMinutes>0 && payload.etaMinutes<=120);
}
export function freshNexRideEta(
  value:number|undefined, timestamp:number|undefined, now=Date.now(),
):number|undefined {
  if(!Number.isFinite(timestamp) || !Number.isInteger(value) ||
     value!<=0 || value!>120 || timestamp!>now+5000 || now-timestamp!>90_000)return undefined;
  return value;
}
export async function updateNexRideLiveTrip(payload:LiveTripPayload) {
  if(!validateNexRideLiveTrip(payload))return "invalid";
  try {
    const plugin=await nativePlugin();
    if(!plugin || await getNexRideNativeAppRole()!==payload.role)return "unsupported";
    const fingerprint=JSON.stringify(payload);
    if(posted.get(payload.role)===fingerprint)return "unchanged";
    const result=await plugin.update(payload);
    if(result.status==="android16_progress" || result.status==="standard_notification"){
      posted.set(payload.role,fingerprint);
    }
    return result.status;
  } catch {return "unavailable";}
}
export async function clearNexRideLiveTrip(tripId="") {
  if(tripId && !uuid.test(tripId))return;
  posted.clear();
  try {const plugin=await nativePlugin();if(plugin)await plugin.clear({tripId});}catch{}
}
export async function readNexRideLiveTripSupport(){
  try {const plugin=await nativePlugin();return plugin ? await plugin.status():null;}
  catch{return null;}
}

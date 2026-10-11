import { createHash, randomBytes } from "node:crypto";

/** Server-only NexRide sharing capabilities. Never persist, log or expose token plaintext. */
export const activeTripStatuses = new Set(["accepted","arrived_pickup","in_trip"]);
export const tripShareUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const tripShareToken = /^[A-Za-z0-9_-]{43}$/;
export function newTripShareCapability() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashTripShareToken(token) };
}
export function hashTripShareToken(token:string) {
  return createHash("sha256").update(token,"utf8").digest("hex");
}
export function allowedTripShare(actor:string, role:"driver"|"rider",trip:{
  rider_id:string|null;assigned_driver_id:string|null;status:string;
}) {
  return activeTripStatuses.has(trip.status) &&
    (role==="rider" ? trip.rider_id===actor : trip.assigned_driver_id===actor);
}
export function tripShareDurationMinutes(raw:unknown):15|30|60 {
  return raw===15 ? 15 : raw===30 ? 30 : 60;
}
export function tripShareLocation(raw:{
  latitude:number|null;longitude:number|null;
  accuracy_meters:number|null;recorded_at:string|null;
}|null,now=Date.now()) {
  if (!raw || typeof raw.latitude!=="number" || typeof raw.longitude!=="number" ||
    !Number.isFinite(raw.latitude)||!Number.isFinite(raw.longitude) ||
    Math.abs(raw.latitude)>90||Math.abs(raw.longitude)>180) return null;
  const time=Date.parse(raw.recorded_at||"");
  if(!Number.isFinite(time)||time>now+5000||now-time>45000)return null;
  const accuracy=raw.accuracy_meters;
  if(typeof accuracy!=="number"||!Number.isFinite(accuracy)||accuracy<0||accuracy>100)return null;
  return {
    lat:Math.round(raw.latitude*100000)/100000,
    lng:Math.round(raw.longitude*100000)/100000,
    updatedAt:new Date(time).toISOString(),
    accuracyMeters:Math.round(accuracy),
  };
}
export function safeTripShareText(value:unknown,max=110) {
  return typeof value==="string" ? value.replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,max):"";
}

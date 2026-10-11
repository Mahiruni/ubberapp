/** Android's native system Sharesheet with browser/clipboard fallbacks. */
import { publicConfig } from "./runtime-config";

export async function shareNexRideTripLink(url:string):Promise<"shared"|"copied"|"cancelled"|"unavailable"> {
 if(typeof window==="undefined")return "unavailable";
 try {
  const parsed=new URL(url);
  const trusted=new URL(publicConfig.appUrl);
  if(parsed.protocol!=="https:" || parsed.origin!==trusted.origin ||
     !/^\/share\/trip\/[A-Za-z0-9_-]{43}$/.test(parsed.pathname) ||
     parsed.search || parsed.hash)return "unavailable";
 }catch{return "unavailable";}
 const text="Follow my NexRide trip safely. This link expires automatically and can be revoked.";
 try {
  const {Capacitor}=await import("@capacitor/core");
  if(Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Share")) {
   const {Share}=await import("@capacitor/share");
   await Share.share({title:"NexRide · Live trip",text,url,dialogTitle:"Share trip with a trusted contact"});
   return "shared";
  }
  if(typeof navigator.share==="function"){
   await navigator.share({title:"NexRide · Live trip",text,url});
   return "shared";
  }
 } catch(error) {
  if(error instanceof DOMException && error.name==="AbortError")return "cancelled";
 }
 try {
  await navigator.clipboard.writeText(url);
  return "copied";
 } catch{return "unavailable";}
}

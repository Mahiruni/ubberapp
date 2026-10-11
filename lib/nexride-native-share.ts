/** Android's native system Sharesheet with browser/clipboard fallbacks. */
export async function shareNexRideTripLink(url:string):Promise<"shared"|"copied"|"cancelled"|"unavailable"> {
 if(typeof window==="undefined"||!/^https:\/\/ubberapp\.vercel\.app\/share\/trip\/[A-Za-z0-9_-]{43}$/.test(url))
  return "unavailable";
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

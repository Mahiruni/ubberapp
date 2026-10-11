import type { Metadata } from "next";
export const metadata:Metadata={
  title:"Live Trip · NexRide",
  description:"Private time-limited NexRide live trip progress",
  robots:{index:false,follow:false,nocache:true},
  referrer:"no-referrer",
};
export default function SharedTripLayout({children}:{children:React.ReactNode}){
 return <>{children}</>;
}

import type { Metadata } from "next";
export const metadata:Metadata={
  title:"Live Trip · Biloo",
  description:"Private time-limited Biloo live trip progress",
  robots:{index:false,follow:false,nocache:true},
  referrer:"no-referrer",
};
export default function SharedTripLayout({children}:{children:React.ReactNode}){
 return <>{children}</>;
}

import type { Metadata } from "next";
import { ServiceStandardPage } from "../../components/nexride/confidence";
export const metadata: Metadata = { title: "The NexRide standard", description: "What to expect from pickup to arrival. Clear service expectations for NexRide riders and drivers.", alternates: { canonical: "/standard" } };
export default function StandardPage() { return <ServiceStandardPage/>; }

import type { Metadata } from "next";
import { BrandExperience } from "../../components/nexride/brand-experience";
export const metadata: Metadata = { title: "NexRide — Confidence in every journey", description: "Your city. Your pace. Your NexRide. Discover a thoughtful ride experience for Addis Ababa, Ethiopia.", alternates: { canonical: "/explore" } };
export default function Explore() { return <BrandExperience/>; }

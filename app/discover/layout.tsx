import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Discover Addis Ababa",
  description: "Discover NexRide places and mobility experiences across Addis Ababa.",
  alternates: { canonical: "/discover" },
};

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}

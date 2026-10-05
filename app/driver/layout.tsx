import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Drive with NexRide",
  description: "NexRide Driver onboarding, authentication, and driver access.",
  alternates: { canonical: "/driver" },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return children;
}

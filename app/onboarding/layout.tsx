import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Get started",
  description: "Set up NexRide and continue to rider sign in.",
  robots: { index: false, follow: false },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

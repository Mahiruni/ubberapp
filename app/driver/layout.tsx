import type { Metadata } from "next";
import { NexRideLanguageProvider } from "../../components/nexride/language-provider";
import { DriverAppShell } from "../../components/nexride/driver-app-shell";

export const metadata: Metadata = {
  title: "Drive with NexRide",
  description: "NexRide Driver onboarding, authentication, and driver access.",
  alternates: { canonical: "/driver" },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <NexRideLanguageProvider>
      <DriverAppShell>{children}</DriverAppShell>
    </NexRideLanguageProvider>
  );
}

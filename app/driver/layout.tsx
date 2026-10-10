import type { Metadata } from "next";
import { NexRideLanguageProvider } from "../../components/nexride/language-provider";
import { DriverAppShell } from "../../components/nexride/driver-app-shell";

export const metadata: Metadata = {
  title: "Drive with NexRide",
  description: "NexRide Driver — Drive. Earn. Grow. Use your own Driver app icon.",
  applicationName: "NexRide Driver",
  manifest: "/driver.webmanifest",
  appleWebApp: {
    capable: true,
    title: "NexRide Driver",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/driver-favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/driver-favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/driver-favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: [{ url: "/driver-favicon.ico", type: "image/x-icon" }],
    apple: [
      { url: "/driver-apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  alternates: { canonical: "/driver" },
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <NexRideLanguageProvider>
      <DriverAppShell>{children}</DriverAppShell>
    </NexRideLanguageProvider>
  );
}

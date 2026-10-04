import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./polish.css";
import "./premium-overrides.css";

export const metadata: Metadata = {
  title: "NexRide",
  description:
    "NexRide — Better Rides. A Brighter Tomorrow. A ride-hailing experience for Ethiopia.",
  applicationName: "NexRide",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "NexRide",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icons/icon-192.svg",
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#041C30",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

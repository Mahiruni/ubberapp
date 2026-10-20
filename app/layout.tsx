import type { Metadata, Viewport } from "next";
import { NexRideNativeLaunchBridge } from "../components/nexride/native-launch-bridge";
import { ServiceWorkerRegistration } from "../components/nexride/service-worker";
import { NexRideFeedbackBootstrap } from "../components/nexride/feedback-bootstrap";
import { NexRideNativeNavigationBridge } from "../components/nexride/native-navigation-bridge";
import { NexRideNativePushBootstrap } from "../components/nexride/native-push-bootstrap";
import { NexRideLanguageProvider } from "../components/nexride/language-provider";
import { NexRideResilienceProvider } from "../components/nexride/resilience-provider";
import { NEXRIDE_SITE_URL } from "../lib/nexride-site";
import "./globals.css";
import "./polish.css";
import "./premium-overrides.css";
import "./trip-experience.css";
import "./final-polish.css";
import "./brand-system.css";
import "./flagship-system.css";
import "./rider-flagship.css";
import "./redesign-award-winning.css";
import "./mobility-system.css";
import "./detail-system.css";
import "./ethiopic-font.css";
import "./resilience.css";
import "./live-location.css";
import "./driver/driver-shell.css";
import "./audio-system.css";
import "./identity-experience.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-800.css";
import "./premium-mobility.css";
import "./nexride-2026-tokens.css";
import "./elite-inspired-menus.css";
import "./biloo-brand-system.css";

const description =
  "Book reliable rides across Addis Ababa with Biloo, a rider and driver mobility platform built for Ethiopia.";

export const metadata: Metadata = {
  metadataBase: new URL(NEXRIDE_SITE_URL),
  title: {
    default: "Biloo — Ride Across Addis Ababa",
    template: "%s | Biloo",
  },
  description,
  applicationName: "Biloo Rider",
  category: "transportation",
  keywords: [
    "Biloo",
    "Biloo Ethiopia",
    "ride app Ethiopia",
    "taxi app Addis Ababa",
    "ride-hailing Addis Ababa",
    "book a ride Ethiopia",
  ],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Biloo Rider",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      {
        rel: "mask-icon",
        url: "/safari-pinned-tab.svg",
        color: "#F9C449",
      },
    ],
  },
  openGraph: {
    type: "website",
    locale: "en_ET",
    url: "/",
    siteName: "Biloo",
    title: "Biloo — Ride Across Addis Ababa",
    description,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Biloo — Better Rides. A Brighter Tomorrow.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Biloo — Ride Across Addis Ababa",
    description,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7FAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#08295F" },
  ],
  colorScheme: "light dark",
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": NEXRIDE_SITE_URL + "/#organization",
    name: "Biloo",
    url: NEXRIDE_SITE_URL,
    logo: NEXRIDE_SITE_URL + "/icons/icon-512.png",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": NEXRIDE_SITE_URL + "/#website",
    name: "Biloo",
    url: NEXRIDE_SITE_URL,
    publisher: { "@id": NEXRIDE_SITE_URL + "/#organization" },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": NEXRIDE_SITE_URL + "/#app",
    name: "Biloo",
    url: NEXRIDE_SITE_URL,
    applicationCategory: "TravelApplication",
    operatingSystem: "Web",
    description,
    publisher: { "@id": NEXRIDE_SITE_URL + "/#organization" },
    areaServed: { "@type": "City", name: "Addis Ababa" },
  },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link
          rel="preload"
          href="/fonts/Benaiah/Benaiah-Bold-Ethiopic.woff2?v=5"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <NexRideNativeLaunchBridge />
        <NexRideLanguageProvider><NexRideResilienceProvider>{children}</NexRideResilienceProvider></NexRideLanguageProvider>
        <NexRideNativeNavigationBridge />
        <NexRideNativePushBootstrap />
        <ServiceWorkerRegistration />
        <NexRideFeedbackBootstrap />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}

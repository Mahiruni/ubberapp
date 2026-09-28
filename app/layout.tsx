import type { Metadata, Viewport } from 'next';
import './globals.css';
import './polish.css';
import './premium-overrides.css';

export const metadata: Metadata = {
  title: 'NexRide',
  description: 'A calm, transparent ride experience for riders and drivers.',
  applicationName: 'NexRide',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'NexRide',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icons/icon-192.svg',
    apple: '/icons/icon-192.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F7F8FA',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

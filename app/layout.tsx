import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NexRide — Move with confidence',
  description: 'A calm, transparent ride experience for riders and drivers.',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

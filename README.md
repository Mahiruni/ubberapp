# NexRide

NexRide is a mobile-first ride-hailing experience focused on clarity, trust, and calm interaction design.

## Included
- Rider booking with pickup/destination, suggestions, ride classes, transparent fare estimate, scheduling entry point and multi-stop toggle.
- Live-trip experience with driver identity, vehicle/plate, ETA, chat/call/SOS/share actions.
- Driver workspace with online/offline state, request acceptance, earnings, navigation, documents and safety entry points.
- Wallet, payment methods, promo/referral UI, trip history and receipts.
- Safety center and trusted-contact flows.
- Responsive mobile navigation, dark/light mode and English/Amharic language toggle.
- Browser geolocation with graceful fallback and a fast vector-style map surface that works without a third-party API key.
- PWA manifest and production Next.js structure.

## Production integrations
The interaction layer is implemented without fake external network calls. Real fleet matching, authenticated accounts, persistent trip state, production map routing/tiles, SMS/voice, push notifications and payment settlement require service credentials and a backend such as Supabase/Postgres + Realtime, a maps provider, and a payment provider. Those integrations should be wired through server-side adapters rather than exposing credentials in the browser.

## Run
`npm install && npm run dev`

## Build
`npm run build && npm start`

This repository uses Next.js 16.3.6, the current Active LTS line at the time of creation.

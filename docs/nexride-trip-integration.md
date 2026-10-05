# NexRide rider trip screens

The assigned-driver, active-trip and receipt/rating designs are now part of this Next.js app. The original screen designs are versioned in `public/nexride/screens`. The rider workspace renders them in same-origin frames through `TripExperience`, with the app retaining authentication, navigation and database access. The bridge validates both origin and source and sends only narrowed presentation data. No session tokens enter the frames.

## Live Supabase connection

Uses the existing `lib/supabase.ts` client and configured DriverSuperApp project (`mrbgtdrpscdoxwdgvfcs`). Signed-in riders can resume their active trip from Home or open their own recent bookings in Activity. Queries filter `trips.customer_id` to the authenticated user and rely on database RLS. Trip status, payment and location remain server-authoritative. Riders cannot start or complete real trips.

The trip adapter reads participant-accessible profiles, drivers, vehicles, ride_locations, driver_locations, payments and ratings. Realtime subscriptions are scoped to the selected trip; a serial five-second read provides recovery. Last reported coordinates and timestamps survive tracking outages. Locations from other drivers, before the booking, or far in the future are rejected. Reassignment removes the old driver and fix. Vehicle movement interpolates for 650ms only between newer received fixes of the same driver, respects reduced motion, and stops during stale tracking or outages. The Leaflet map has OpenStreetMap attribution and reports missing tiles.

No sample ETA, route, photograph, rating, verification, fare or payment is promoted into a real booking. A trip without one uniquely identifiable assigned vehicle shows unavailable vehicle details rather than arbitrarily choosing a driver's car. Payment comes from the payment record, not from the completion heading. Feedback retries preserve the draft; existing ratings are checked before invoking `submit_trip_rating`. Optional feedback tags are stored with the comment because the existing ratings schema has no tag column.

## Current service boundaries

- The repository's ride-request/matching endpoints are still 503 placeholders. This change reads existing bookings; it does not invent dispatch or create bookings directly from client fare estimates.
- Cancellation requires an authoritative fee quote and atomic confirmation service. None exists in the current app. The screen explains that the policy/fee cannot be confirmed and blocks cancellation rather than assuming it is free.
- Share trip uses the device share sheet or clipboard for an explicitly disclosed static trip snapshot. There is no public, expiring tracking-link service in the current backend; the recipient can retain/forward the text indefinitely.
- Missing ETA/distance/route, photos and verification are omitted or labeled unavailable. Provider-supplied route/metrics may be supplied through authenticated ride-event metadata; they are never calculated from straight-line distance.
- Chat inserts participant-authorized messages into `chat_messages` and reports acceptance as Sent; it does not claim delivery/read receipts.
- Receipt details, booking reference and the support entry remain accessible after rating or Skip. No functioning support URL is invented when one is absent.

## Migration and deployment status

`202610050001_nexride_rating_first_submission.sql` changes the existing rating RPC to lock the completed trip and preserve the first rating atomically, with participant checks, bounded feedback and restricted direct writes. **It has not been applied remotely:** none of the currently connected Supabase accounts can manage DriverSuperApp. The current client remains compatible with the existing RPC, including its current upsert behavior; the UI checks existing ratings, but database-level concurrent first-write protection requires this migration.

Apply it to the existing project after connecting an account with access. Do not substitute an unrelated connected Supabase project or put a service-role key in the browser.

## Validation

Run `npm test`, `npx tsc --noEmit`, `npm run build`, and the Playwright flows/trip screen tests. Browser tests use mocked rider sessions and participant rows; production authenticated RLS cannot be certified without authorized rider/driver fixtures in the actual project. Public requests to sensitive tables were checked with zero-row queries and were denied by the existing authorization policies.

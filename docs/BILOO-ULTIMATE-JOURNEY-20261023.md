# Biloo connected journey release — 23 October 2026

This release extends the existing Rider, Driver and Administration applications. It retains unified Supabase identities, the current booking/dispatch engine, driver approval controls, Mapbox, navigation ownership and existing payment records.

## Rider experience

- Vehicle selection leads to **Continue**, then a review of the recorded pickup/destination, provider route distance/duration, available category, estimated ETB fare, charges and cash payment method. Optional pickup instructions are validated on the server and retained on the trip.
- A valid route keeps **Choose a ride** accessible when Android's keyboard reduces the visual viewport. Existing manual pickup, Mapbox search, saved/recent destinations and map selection remain in place.
- Booking uses the existing client request key and database uniqueness protections. Retrying an already-created request resolves its original ID before checking quote expiration. New requests require a successful Mapbox driving route; provider failure does not insert a booking or cancel the previous search.
- Replacing an exhausted search uses a guarded update. If a Driver accepts concurrently, the assigned request is resumed rather than cancelled or duplicated.
- Matching progress comes from persisted request/offer data. Elapsed search time starts at the recorded request timestamp. Delivered offers show a waiting state; expiring one offer does not invent expiration of the whole request.
- Reopening the app restores a pending or assigned journey from an authenticated backend read. Moving from history into the map preserves the selected trip across workspace remounts. An offline cache cannot create or resume a booking request by itself.
- Assigned and in-progress trips use actual driver fixes and authenticated Mapbox route calculations. Stale coordinates, failed routing, changed assignment or terminal stages suppress a fresh ETA. Last-known timestamps remain visible. The route is framed with panel-aware camera padding without remounting the map.
- Call, chat, secure sharing and safety retain the existing protected capabilities. Real-trip completion uses a native receipt with the confirmed fare, truthful payment status, recorded duration, explicitly labelled estimated route distance and trip reference. Rider ratings await server confirmation and support retry without duplicate records.

## Driver and Administration

- Incoming requests expose real pickup instructions, an accessible **Accept Ride** action and the existing backend acceptance result. A competing acceptance remains unavailable; it cannot produce a local assignment.
- Arrival, start and completion remain authorized database transitions. Start still requires the Driver's explicit pickup confirmation. A new database guard rechecks approved review status and an active account before arrival or start. Duplicate UI mutations are locked while pending.
- Confirmed completion opens a native Driver receipt and links to the existing earnings/payment view. Completion does not mark a payment as paid.
- Administration's Rides module now offers **Journey details**: lifecycle timestamps, offer states, estimated/final fare, payment status and critical event history. The inspector does not request live GPS coordinates or contact numbers.
- New journey surfaces use compact light cards, Biloo green actions, tabular amounts, short content transitions and reduced-motion support. Existing menus, typography and brand assets are retained.

## Database changes

Both additive migrations were applied to the connected NexRide Supabase project:

1. `20261023160207_biloo_journey_event_audit.sql`: trigger-owned journey/offer events with an indexed timeline, admin-only RLS reads and no client append/update/delete permission. Event metadata excludes coordinates and contact details. Existing records are not assigned invented history.
2. `20261023162320_biloo_booking_pickup_authorization.sql`: ensures the optional pickup-instructions field exists and rechecks current Driver eligibility for pickup transitions.

The `pickup_confirmed` event records the Driver's existing start-confirmation action. It is not a PIN verification claim. Existing stage-order, ownership, atomic assignment and cancellation guards remain authoritative.

## Validation

| Check | Result |
| --- | --- |
| Unit suite | 300 tests across 63 files passed |
| Optimized Next.js build and TypeScript | Passed |
| New connected-journey browser suite | 18 checks passed across desktop Chromium and Pixel 7 emulation |
| Real database authorization exercise | Rollback-only request/cancellation, suspension rejection, approved arrival/start/completion and event assertions passed |
| Audit permissions | RLS enabled; non-admin reads, anonymous reads and authenticated event insertion rejected |
| Test cleanup | Rollback fixture users and rides absent after validation |
| Supabase security advisors | No new findings; pre-existing project advisories remain |

The browser suite uses isolated network fixtures. It covers booking review and notes, Android keyboard geometry, matching delivery, recovery without new POSTs, provider ETA and stale tracking, rating failure/retry, Driver stage confirmations, competing acceptance, admin privacy and reduced motion. These fixtures are not inserted into production. The suite is included in the existing identity-experience CI workflow.

The complete historical browser suite was not rerun as part of this release. These results do not establish real Android startup, battery, mobile-network or on-road GPS performance; those require physical-device acceptance testing. No successful paid trip or payment transaction was simulated on the production backend.

## Capability boundaries

The active backend uses sequential dispatch and direct Driver acceptance. Rider counteroffers, rider selection among competing negotiated prices, additional stops, scheduling, pickup PINs and Driver-to-rider ratings are not introduced as frontend-only features. Unavailable vehicle categories remain unavailable.

Chapa API v2 and ArifPay activation remain deferred. Cash/pending records retain their authoritative state. Existing disputes, settlements and other administration controls are preserved; this release does not add an independent settlement system or guarantee a final charge from an estimate.

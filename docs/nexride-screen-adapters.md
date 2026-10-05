# NexRide assigned-driver screen

The published screen opens as an explicitly labeled design preview. The portrait is fictional. All trip, plate, rating, ETA, route, fare, and cancellation quotes in preview mode are samples. It does not create bookings, send messages, call a sample number, charge fees, or simulate live movement.

To connect to the existing app, call `window.NexRide.connect(adapter)` with a trusted adapter after loading the screen. No credentials belong in frontend code. The adapter must enforce authenticated access and booking policy on the server.

## Adapter contract

- `bookingId`: the active booking identifier.
- `subscribe(onBooking, onDisconnected, onConnected)`: subscribe to authoritative complete booking snapshots. Return an unsubscribe function. Revisions must increase monotonically. Emit disconnection and reconnection callbacks for the tracking transport; browser online status alone cannot prove the transport is connected.
- `getCancellationQuote({ bookingId, revision })`: return `{ allowed, amount, currency, quoteId, expiresAt }`. An unknown, expired, disallowed, or incomplete quote blocks confirmation. `expiresAt` is epoch milliseconds. Never use a client-side fee calculation.
- `cancelBooking({ bookingId, quoteId, revision })`: atomically validate the quote, revision, authorization, and booking policy, then return an authoritative cancelled snapshot. A request error is not a confirmed cancellation.
- `sendMessage({ bookingId, driverId, text })`: persist and send to the currently assigned driver. Resolve only when accepted. The UI says “Sent”, never “Delivered” or “Read”. Connect incoming messages in your existing chat screen if needed.
- Optional `mountMap(container)`, `updateMap(booking)`, `recenterMap()`: integrate your existing geographic map. Include the map provider’s attribution and respect stale/no-location/reassigned/cancelled states. Without a map adapter, live coordinates are displayed as an explicitly labeled location diagram on a plain background, not road navigation. The dashed trip line connects endpoints; it is not a calculated road route.

## Authoritative booking snapshot

```
{
  id, revision,
  status: 'approaching' | 'arrived' | 'reassigning' | 'cancelled',
  category,
  fare: { amount, currency },
  pickup: { name, area, instructions, lat, lng },
  destination: { name, lat, lng },
  driver: {
    id, name, photo, rating?, tripCount?, contactPhone?,
    vehicle: { model, color, plate, capacity? },
    verification?: { status: 'verified', source, verifiedAt }
  },
  tracking?: {
    driverId, lat, lng, updatedAt,
    etaMinutes?, etaUpdatedAt?,
    route?: [{ lat, lng }, ...]
  },
  shareUrl?, supportUrl?
}
```

Times use epoch milliseconds. `tracking.driverId` must match the assigned driver. Snapshots that do not include an assigned driver cannot present an approach or arrival. Rating, completed trips, and verification are omitted when absent. Verification must come from trusted verified records; preview mode never displays it.

The frontend treats location and ETA older than 45 seconds as unavailable and keeps the last known location clearly labeled. It never derives “arrived” from distance or a timer. Reassignment clears the previous driver and tracking. Cancellation stops tracking and contact actions. A new driver assignment closes any previous driver’s chat or cancellation dialog.

Call requires a supplied contact number. Chat requires an adapter. Share uses the device share sheet or copies current trip details; a live tracking link is included only when supplied. Safety provides vehicle-identification guidance and optional backend-provided support. Emergency response and country-specific emergency numbers are not fabricated.

The app exposes a feature-detected, read-only WebMCP `read_nexride_booking` tool using the same visible state. Browser registration validation was unavailable in this environment.

## Active trip: `/trip.html`

The active-trip screen uses the existing visual identity and driver asset. `/` keeps the assigned-driver screen. Each screen links to the other for design review; these links do not change a real booking's state.

Connect the active-trip screen with `window.NexRideTrip.connect(adapter)`. The adapter uses the same `bookingId`, `subscribe`, `sendMessage`, and optional map methods. It accepts complete, monotonically increasing integer revisions, with `status: 'in_trip' | 'completed' | 'cancelled'`. Location updates must carry the assigned `driverId`; older location timestamps and old revisions cannot advance the displayed vehicle. The booking stream remains responsible for authenticated access and authoritative status.

Additional snapshot fields:

```
route: { id, points: [{ lat, lng }, ...] },
metrics: { arrivalAt, remainingMeters, updatedAt },
delayedArrival: true | false,
tracking: { driverId, lat, lng, updatedAt, accuracyMeters? }
```

All times are epoch milliseconds. ETA is a supplied arrival timestamp; the frontend never invents a countdown. Distance is supplied by the backend, never calculated from a straight-line diagram. Route changes require a supplied revised route. Delayed arrival is shown only when explicitly flagged. Location and metrics expire after 45 seconds; missing or stale estimates are hidden. The stale banner says “Location last updated…” and keeps the last known marker. Browser online state cannot override a reported transport outage. The freshness timer never advances the vehicle.

Vehicle interpolation lasts 650 ms, starts only for a newer received fix from the same driver, and stays within the previous and new reported endpoints. It never follows a route without a fix or predicts the next position. Projection changes and driver changes snap to their actual data rather than implying movement. Reduced motion skips interpolation. On stale tracking or disconnection, animation stops at the latest received fix. External map providers must implement the same policy: `updateMap(snapshot, context)` supplies `receivedLocationUpdate`, `trackingCurrent`, `connected`, `interpolateOnlyReceivedFixes`, and `reducedMotion`. `mountMap` receives a dedicated map surface, leaving the status and safety controls intact. The fallback live map is a plain location diagram using supplied route coordinates. Its camera reserves space above the bottom card. A real map adapter must preserve correct attribution.

Optional `getShareAccess({ bookingId, revision })` returns `{ url, expiresAt, scopes, audience, endsWithTrip? }`. Supported `scopes` are `vehicle_location`, `destination`, `driver_name`, `vehicle`, and `eta`. `audience` is `anyone_with_link` or `invited_contacts`. A future finite `expiresAt` and nonempty supported scopes are required. The server must enforce these exact permissions and expiry, and enforce trip-end revocation if `endsWithTrip` is true. The frontend explains these facts before opening the device share flow or copying a link. It blocks sharing when permission or expiry data is incomplete, when access expires before confirmation, or when the trip ends. It does not promise a tracking link if this adapter is absent: the fallback explicitly shares static trip text that a recipient may retain or forward indefinitely. No live access is fabricated.

Preview controls exercise route changes, delays, stale location, missing metrics, completion, and connection loss. “Receive sample location” provides an explicitly synthetic sample fix to inspect interpolation. Preview movement never runs on a timer. These controls are hidden for live bookings.

Safety stays enabled during outages and after a trip ends. Share trip requires an active trip. The active screen does not cancel or stop a real trip. `read_nexride_active_trip` is an optional read-only WebMCP tool returning the displayed state. Browser-based visual and WebMCP registration checks are unavailable for this static preview environment.

## Completion and rating: `/completion.html`

This screen keeps trip completion, payment confirmation, and rating confirmation as separate states. The demo uses a labeled sample receipt and the existing fictional portrait. The success icon and “Trip completed!” heading refer to the ended trip, never to payment. Payment can be `paid`, `pending`, `failed`, or unavailable; pending/failed notices remain visible after the rating flow ends. Missing final amounts are unavailable rather than inferred from an estimate.

Use `window.NexRideCompletion.connect(adapter)` with:

- `tripId`: the receipt's booking identifier.
- `subscribe(onReceipt, onError, onConnected)`: emit authoritative complete receipt snapshots with strictly increasing integer revisions; return an unsubscribe function. Initial loading never displays a confirmed completion or payment. Payment-only updates preserve drafts and submission state.
- `submitRating({ tripId, score, tags, feedback, idempotencyKey })`: validate ownership, trip completion, stars 1–5, supported tags, and feedback length server-side. Persist the rating atomically and enforce one rating per trip. Retry of the same draft reuses the same idempotency key. Return `{ tripId, status: 'accepted' | 'already_rated', rating: { status: 'submitted', score? } }` only after confirmation. Incomplete replies and network failures do not count as success. An already-rated reply with no score still blocks a second submission without inventing the previous score.
- Optional `supportUrl`: your authenticated, functioning support route; alternatively include `supportUrl` on the receipt. No support request is sent by the preview. Without a route, the UI provides the booking reference and explains that a support contact has not been connected.

Receipt shape:

```
{
  id, revision, status: 'completed', completedAt,
  category,
  driver: { id, name, photo, vehicle: { model, color, plate } },
  pickup: { name }, destination: { name },
  finalAmount: { amount, currency: 'ETB' },
  payment: { status: 'paid' | 'pending' | 'failed' | 'unknown', method? },
  lineItems?: [{ label, amount }], // all amounts in ETB, supplied by backend
  rating?: { status: 'submitted', score?: 1 | 2 | 3 | 4 | 5 },
  supportUrl?
}
```

Native radio inputs provide five labeled, keyboard-accessible stars; native checkboxes provide optional tags (`friendly`, `clean`, `smooth`, `on_time`). Optional written feedback is limited to 1,000 characters and expands with the tags to keep the screen compact. Submitting disables editing and Skip, announces progress, and prevents duplicate requests. Failures preserve the stars, tags, and text for retry. Editing a failed draft begins a new idempotency key. Skip is a local rating-flow choice, not a submitted rating; the user can reopen rating with the draft retained. Receipt details and Trip support remain accessible during and after Submit, Skip, or already-rated states.

Preview states include pending/failed/unavailable payment, an intentionally failed first submission followed by a successful retry, and already-rated. The read-only `read_nexride_receipt` WebMCP tool exposes receipt and flow state, excluding unsent draft feedback. Browser registration and visual QA remain unavailable for this static preview environment.

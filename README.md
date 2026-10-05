# NexRide

**Better Rides. A Brighter Tomorrow.**

NexRide is a responsive ride-hailing frontend for Ethiopia, built with Next.js App Router and React. The rider home pairs a light geographic street map with a destination panel; the driver workspace uses deep navy surfaces and emerald actions. English and Amharic share one translation system, with a bundled licensed Ethiopic fallback font.

## Frontend experience

- Map-focused rider home with profile/recenter controls, device-location accuracy, Home/Work/Saved shortcuts and recent preview selections.
- English/Amharic destination search with distinct locality details, editable endpoints, saved/recent preview places, browser geolocation and map-pin selection.
- Route review with confirmed pickup/destination pins, provider road geometry and estimates when configured, and recoverable routing/coverage states.
- Economy, Comfort and XL ride selection with original vehicle illustrations, aligned ETB prices, payment editing, and explicit sample/estimated/confirmed pricing states.
- Matching preview, sample driver card, trip progress, completion and locally saved ratings.
- Wallet preview, local trip details, editable preview profile and appearance settings.
- Driver availability preview, sample request acceptance/decline, navigation illustration, sample earnings and trip history.
- Responsive desktop sidebar/map workspace and mobile map/sheet layout with safe-area-aware bottom navigation.
- Reusable buttons, inputs, cards, sheets, navigation, status banners, skeletons and keyboard-accessible dialogs.
- Rider startup splash with a licensed Addis Ababa photograph, a separate provisional folded-N vector, reduced-motion support, bounded session restoration and recovery controls.
- First-time onboarding at `/onboarding` and existing-account Supabase sign-in at `/auth`.
- Existing authenticated Supabase operations dashboard at `/admin`.

## Run and check

```sh
npm install
npm run dev
npm run build
npm run test
npx playwright install
npm run test:e2e
```

The Playwright configuration also accepts `PLAYWRIGHT_CHROMIUM_PATH` for an installed Chromium executable and `PLAYWRIGHT_SERVER_COMMAND` to test a production server. Safari/WebKit remains a separate test project.

## Integration status

The public rider/driver workspace is a labeled preview, as the prior page did not call authenticated booking, dispatch, messaging or payment services. Sample actions never dispatch drivers or charge users. Rider home renders a browser-provided location fix on a geographic map; nearby vehicles remain hidden because availability is not connected. Destination search and ride selection stay on the geographic map. Later ride workflows use an illustration that does not represent live tracking or real navigation. Preview profiles are stored on the device without passwords; they are not authenticated accounts.

Supabase configuration, migrations and admin authentication, role checks, realtime subscriptions and data operations are preserved. See [the frontend integration boundaries](docs/frontend-reference.md) and the existing backend architecture/environment documents before connecting production services.

## Rider startup

The full splash is shown only while the initial device preferences and Supabase session are being restored. It has no minimum display time, caches successful initialization for route transitions, and provides retry after an eight-second service timeout. Corrupted preview preferences can be reset without deleting authentication storage. First visits open onboarding; completed onboarding leads to sign-in; restored sessions and explicitly opted-in or existing preview users open rider home. Signing in does not enable live booking or payments.

The provisional symbol lives separately in `public/brand/provisional/` and must be replaced with the approved brand asset when available. The splash photograph is DaneyWiki’s Addis Ababa skyline from Sheger Park, licensed CC BY-SA 4.0; the source and attribution are included beside the asset and on entry screens.

## Destination search and routing

`/api/rider/search` adapts Mapbox v6 forward/reverse geocoding; `/api/rider/route` adapts Mapbox driving directions. Set `MAPBOX_ACCESS_TOKEN` server-side (the existing public token is supported as a fallback). The local preview place catalog supports English and Amharic; remote results retain the provider’s names and addresses. Temporary geocoding results and device/pin coordinates stay in memory and are not written to saved history.

Set `NEXRIDE_SERVICE_BOUNDS` to verified west,south,east,north bounds to enforce service coverage. Without configuration, the geographic restriction is labeled an Addis Ababa **preview area**, not live coverage. Provider outages do not produce fallback routes or journey estimates. With no routing token, valid endpoints can continue only into explicitly labeled preview ride options. Missing/unconfirmed endpoints, routing failures, identical locations and coverage violations block continuation.

The mobile search sheet supports dragging and keyboard resizing, adjusts to the visual viewport, and reserves separate map space. On desktop it is a side panel. Editing or dragging an endpoint invalidates the previous route; confirming a pin reroutes from the exact coordinate while reverse geocoding updates only its label.

## Ride selection and booking boundary

`/api/rider/fares` currently returns validated **sample** quotes for Economy, Comfort and XL. Passenger capacities are examples, pickup arrival estimates are unavailable, and additional charges are not connected. The disabled “Request Ride” action explains that booking is unavailable; “Preview this ride” preserves the existing local demonstration without dispatching a driver or taking payment.

`lib/nexride-booking.ts` defines the fare and request adapter contracts. Future service quotes must identify availability, pickup estimates when known, pricing type, all additional charges, revision and expiry. The frontend totals the listed charges, rejects malformed or expired quotes, refreshes expired quotes, and requires explicit review when prices change. A confirmation dialog presents the full total and payment method before a connected request. Requests use a synchronous submission lock and a stable idempotency key for retrying the same attempt. Pending submission locks map editing and navigation.

`/api/rider/requests` deliberately returns an unavailable response. Replacing that boundary requires authenticated server pricing, quote/coverage validation and durable server-side idempotency before creating a trip. Existing Supabase admin operations are unchanged. Failed requests remain on ride selection with a recovery message; an uncertain response never claims a successful match. Accepted adapter responses show a receipt only and never launch the sample driver-assignment flow.

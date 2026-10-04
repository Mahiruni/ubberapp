# NexRide

**Better Rides. A Brighter Tomorrow.**

NexRide is a responsive ride-hailing frontend for Ethiopia, built with Next.js App Router and React. The rider home pairs a light geographic street map with a destination panel; the driver workspace uses deep navy surfaces and emerald actions. English and Amharic share one translation system, with a bundled licensed Ethiopic fallback font.

## Frontend experience

- Map-focused rider home with profile/recenter controls, device-location accuracy, Home/Work/Saved shortcuts and recent preview selections.
- Clearly labeled preview destination search across Addis Ababa landmarks and optional browser geolocation.
- Ride-class selection with explicitly labeled illustrative fares.
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

The public rider/driver workspace is a labeled preview, as the prior page did not call authenticated booking, dispatch, messaging or payment services. Sample actions never dispatch drivers or charge users. Rider home renders a browser-provided location fix on a geographic map; nearby vehicles remain hidden because availability is not connected. Other ride workflows use an illustration that does not represent live tracking or real navigation. Preview profiles are stored on the device without passwords; they are not authenticated accounts.

Supabase configuration, migrations and admin authentication, role checks, realtime subscriptions and data operations are preserved. See [the frontend integration boundaries](docs/frontend-reference.md) and the existing backend architecture/environment documents before connecting production services.

## Rider startup

The full splash is shown only while the initial device preferences and Supabase session are being restored. It has no minimum display time, caches successful initialization for route transitions, and provides retry after an eight-second service timeout. Corrupted preview preferences can be reset without deleting authentication storage. First visits open onboarding; completed onboarding leads to sign-in; restored sessions and explicitly opted-in or existing preview users open rider home. Signing in does not enable live booking or payments.

The provisional symbol lives separately in `public/brand/provisional/` and must be replaced with the approved brand asset when available. The splash photograph is DaneyWiki’s Addis Ababa skyline from Sheger Park, licensed CC BY-SA 4.0; the source and attribution are included beside the asset and on entry screens.

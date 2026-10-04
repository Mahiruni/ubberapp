# NexRide

**Better Rides. A Brighter Tomorrow.**

NexRide is a responsive ride-hailing frontend for Ethiopia, built with Next.js App Router and React. The rider interface pairs a light illustrated map with a booking panel; the driver workspace uses deep navy surfaces and emerald actions. English and Amharic share one translation system, with a bundled licensed Ethiopic fallback font.

## Frontend experience

- Destination search across Addis Ababa landmarks and optional browser geolocation.
- Ride-class selection with explicitly labeled illustrative fares.
- Matching preview, sample driver card, trip progress, completion and locally saved ratings.
- Wallet preview, local trip details, editable preview profile and appearance settings.
- Driver availability preview, sample request acceptance/decline, navigation illustration, sample earnings and trip history.
- Responsive desktop sidebar/map workspace and mobile map/sheet layout with safe-area-aware bottom navigation.
- Reusable buttons, inputs, cards, sheets, navigation, status banners, skeletons and keyboard-accessible dialogs.
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

The public rider/driver workspace is a labeled preview, as the prior page did not call authenticated booking, dispatch, messaging or payment services. Sample actions never dispatch drivers or charge users. The illustrated map does not represent live GPS tracking or real navigation. Preview profiles are stored on the device without passwords; they are not authenticated accounts.

Supabase configuration, migrations and admin authentication, role checks, realtime subscriptions and data operations are preserved. See [the frontend integration boundaries](docs/frontend-reference.md) and the existing backend architecture/environment documents before connecting production services.

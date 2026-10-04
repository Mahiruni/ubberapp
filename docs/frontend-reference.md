# NexRide reference refinement

The rider and driver workspaces retain Next.js App Router and the existing Supabase client, migrations, configuration and admin data operations. Reusable UI lives in `components/nexride`; `lib/nexride-i18n.ts` owns the English and Amharic strings. The rider experience uses light map surfaces and emerald actions. Driver screens use deep navy surfaces with the same controls and spacing.

## Preview boundaries

The previous public page used local state rather than authenticated booking, dispatch or payments. This implementation makes that boundary explicit on every screen. `/auth` signs existing accounts in through Supabase; preview profiles remain local sample profiles. The ride preview does not create accounts, match drivers, dispatch rides, send communications, charge money or produce live earnings. Preview state is versioned in `nexride-preview-v2`, and only contains a profile, preferences and sample trip. The old local account is migrated without its password and the old storage key is removed. Driver session state is temporary and preserved while navigating within the workspace.

- `lib/nexride-preview.ts`: replace `previewFare` with an authenticated fare and road-routing adapter when that service is connected. Browser geolocation is requested by the user and can provide coordinates for the illustrative estimate. The diagram does not show that coordinate as a live location.
- `components/nexride/map.tsx`: the map is an explicitly labeled illustration. The OpenStreetMap link opens a real street map of Addis Ababa. A configured Mapbox token remains available in existing runtime configuration; it is not sufficient on its own to establish live routing or dispatch.
- `components/nexride/rider.tsx`: matching, driver details, progress, rating and wallet are sample surfaces. Unconnected call, chat, sharing and payment actions display an availability dialog.
- `components/nexride/driver.tsx`: availability, requests, navigation and earnings are clearly labeled samples. Navigation graphics are not turn-by-turn instructions.
- `/admin`: existing Supabase authentication, role checks, realtime subscriptions and operations are preserved. Styling aligns with the navy/emerald system.

All dialogs use native modal focus containment, Escape handling and focus restoration. Controls meet the 44px target, forms use readable 16px inputs, safe area insets are respected, and reduced motion is supported. At 800px and below, a map and scrollable sheet fill the actual viewport; larger screens use a sidebar and map/panel workspace without device frames.

No licensed Benaiah font asset exists in the repository. An openly licensed Noto Sans Ethiopic fallback is bundled with the app, followed by system Ethiopic fonts. Its SIL Open Font License is included beside the assets. If a licensed font is added later, register it through `next/font/local` without fetching an unlicensed copy.

The rider splash uses a licensed high-resolution Addis Ababa photograph by DaneyWiki (CC BY-SA 4.0), with attribution next to the asset and on entry screens. The existing small city card image remains a crop from the supplied design reference and should be replaced if the reference’s image rights are unknown. The provisional folded-N splash symbol is separately named and documented under `public/brand/provisional`.

`lib/nexride-startup.ts` restores device preferences and the existing Supabase client session. It deduplicates initialization and bounds service waits at eight seconds without introducing a minimum splash delay. Session-based routing is a client UX decision; server and admin authorization continue to use their existing checks. Entry and splash messages use the shared English/Amharic translation system.

## Validation

`npm run build`, `npm run test`, and `npm run test:e2e`. End-to-end coverage exercises the rider preview, driver session continuity, language switching, profile migration without passwords, modal keyboard behavior, small-screen overflow, and admin authentication.

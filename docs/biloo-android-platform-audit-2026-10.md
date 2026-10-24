# Biloo Android and PWA runtime audit — October 2026

## Scope and evidence

Audited `Mahiruni/ubberapp` without replacing its existing Next.js application, Supabase backend, Mapbox maps, Rider/Driver entry flows, or administration.

- `package.json`: Next.js 16, React 19, two PWA manifests, Mapbox GL, Supabase JS and optional Capacitor App, Push, Share and Splash plugins.
- `public/manifest.webmanifest`: Biloo Rider installed PWA (`start_url: /`).
- `public/driver.webmanifest`: Biloo Driver installed PWA (`start_url: /driver`).
- `app/layout.tsx`: responsive viewport with `viewportFit: cover`, multiple safe-area-aware styles, and root native navigation, launch, push, resilience and service-worker bridges.
- `public/sw.js`: offline page fallback, explicit asset caching, no personalized navigation HTML cache, and web push notification handling.
- `lib/nexride-location.ts`: browser foreground geolocation watcher.
- `components/nexride/native-navigation-bridge.tsx`: Capacitor plugin bridge that only executes on a native platform.
- `scripts/setup-android-splash.mjs`: utility to run *after* generating a Capacitor Android source project.

**Repository limitation:** At audit time, `capacitor.config.ts`, `capacitor.config.json`, `android/app/src/main/AndroidManifest.xml`, and `android/app/build.gradle` were absent. Therefore this repository is confirmed to support a browser/PWA build, with native-capable *JavaScript integration code*, but NOT a verified, buildable Android project. Do not claim there is a signed APK/AAB, a verified Android notification channel, native predictive Back, a native splash, or Android system-bar configuration without an Android source/build and device testing.

## Changes delivered in this phase

1. Both PWA manifests retain standalone mode and stop listing a fullscreen fallback. Android still owns its status icons. Web content continues to use viewport safe areas; native `WindowInsets` handling requires an actual Android package.
2. Native Capacitor Back closes the keyboard/overlay before app screen navigation, navigates to role-safe parents, then minimizes directly on a single Back at root rather than requiring a double press. Native predictive gesture support and API compatibility still require AndroidX/native checks.
3. Rider and Driver GPS watchers stop while the document is hidden or a native Capacitor activity pauses. The last valid position may remain as stale context. Foreground resume restarts watchers when permission is available, while an explicitly denied permission is not reprompted automatically.
4. The PWA service worker only accepts same-origin, root-relative notification destinations and sanitizes them on *both* notification receipt and click. Server-side Supabase authorization is still necessary when opening a ride or account page.
5. Safe service-worker cache version rolled forward so old PWA runtime assets are eventually evicted. The worker intentionally does not cache personalized navigations or force a page reload while a trip is active.
6. Tests in `tests/unit/biloo-android-foundations.test.ts` cover manifest config, role-safe Back, GPS lifecycle hooks, and actual notification URL validation.

## Important verification boundary

These are code-level changes. A successful Next.js/Vercel build validates the web release, not native Android resources, keyboard IME/insets, OS permission dialogs, foreground services, predictive Back animation, push channel sound behavior or APK signing. Real-device or emulator testing on Tecno/Infinix/Samsung remains required.

## Native package work to prioritize next

1. Decide whether Biloo ships **one dual-role APK** or separately installable Rider and Driver APKs. Preserve one Supabase auth identity regardless. This decision determines package IDs, deep link ownership, icons, notification channels and distribution.
2. Add a Capacitor configuration and source-controlled `android/` project linked to the existing Biloo production origin/build. Restrict navigation and bridges to trusted origins; do not embed secrets in Android resources.
3. Implement Android 15+ edge-to-edge support using real `WindowInsets`, accounting for gesture navigation, status bars and display cutouts. Test native system-icon contrast on light/dark screens.
4. Use supported splash resources, adaptive icons, Android version codes, backup restrictions, secure release signing and runtime notification permissions. Only enable camera/location/microphone permissions for actual features.
5. Verify AndroidX predictive Back integration against current Android guidance and test root gesture, keyboard, modal, navigation, account logout and active-trip behavior.
6. Test foreground/background GPS policies and any lawful, justified Driver foreground service separately; PWA page visibility events alone do **not** provide guaranteed tracking in the background.
7. Verify real registration/login flows; Rider request/offer/assignment; Driver online, approval, pickup and trip completion; notification deep links after session expiration; process recreation; poor connectivity; safe service-worker updates; and private Supabase Storage/RLS access.

## Sources

Android: https://developer.android.com/develop/ui/views/layout/insets

Android 15 edge-to-edge: https://developer.android.com/codelabs/edge-to-edge

Predictive Back: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture

Never report full Android release completion until the native project, a signed APK/AAB and real-device evidence exist.

# Driver GPS with the screen locked

This implementation belongs to the **Biloo Driver Android APK**. It requires an updated native build; deploying the hosted web interface alone cannot add Android service code to an installed APK. Browser/PWA foreground GPS remains a fallback while the page is visible.

## Starting and stopping

An approved Driver goes Online with the activity visible and location permission granted. `NexRideDriverLocationPlugin` verifies a current session and waits for the service's actual start result. The location foreground service shows an ongoing Android notification, declares its location service type and continues after the WebView pauses or the screen locks. It does not request always-on/background location permission or start an invisible service from the background.

Offline server state, account rejection/suspension, sign-out and revoked credentials stop tracking. Sign-out invalidates queued work before asynchronous token cleanup finishes. Switching accounts also invalidates the previous session's work. A force-stopped/killed service does not restart silently; reopening Biloo reconciles the server state before a new visible start. Android's own foreground-service stop controls remain available.

## Fresh coordinates and network recovery

GPS observations are requested about every 12 seconds with **zero minimum distance**. A parked Driver can therefore keep a fresh position without moving 12 metres. Network positioning is also requested when available. Only real, finite coordinates with accuracy at most 150 metres and an observation age at most 30 seconds are uploaded. A delayed observation is checked again after session renewal, before sending it.

The existing `/api/driver/availability` POST endpoint still verifies the Supabase bearer token, Driver role, active account, approval and Online state. It remains the only writer of the server location freshness stamp. Native tracking does not bypass authorization, extend the 60-second dispatch freshness gate or relabel old fixes as new ones.

Native fixes also update the current active trip's `ride_driver_locations` row, which the Rider and shared-trip maps read. The server resolves the caller's assigned active trip; request bodies cannot choose another Driver or trip ID. The upsert uses the caller's authenticated RLS context and the existing ownership/active-trip database trigger. Its timestamps remain database-owned. The `native_tracking` body marker opts into this additional write and requires a recent timestamp and dispatch-quality accuracy; it is not an authorization signal. Failed trip-location writes are reported as retryable errors rather than acknowledged as a successful tracking update.

Foreground navigation detects the native trip-publishing capability and avoids a second competing writer while it is active. Browser/PWA and legacy APK navigation retain their foreground path, with a fresh-fix check before publishing.

Only one upload may be pending at a time. No coordinate backlog is replayed after a network outage. Failed requests use bounded backoff, and a restored network requests a fresh observation. The service skips uploads when there is no active network. A short, timeout-bounded partial wake lock covers queued refresh/upload work; it is released on every exit and service destruction, rather than held for the whole Online shift.

## Session renewal while JavaScript is paused

The Android service can renew the existing Supabase session through its fixed HTTPS Auth endpoint. The session is stored encrypted with AES-GCM using a non-exportable Android Keystore key, in an atomic file under Android's no-backup directory. The key intentionally does not require a fresh biometric/device-unlock operation for each use, so an already authorized Online shift can renew credentials with the screen locked. Driver cloud/device-transfer backup rules also exclude app data.

The Driver APK's Supabase storage adapter reads this native token source **before** the SDK can try to refresh an obsolete WebView token. SDK token updates are mirrored back to the same store. Browser/PWA and Rider APK clients retain Supabase's normal storage behavior. Older Driver APKs without the new native methods keep their legacy behavior and need an APK update for the new capability.

Renewed credentials must retain the same user and Supabase `session_id`. Refresh-token failures stop GPS and invalidate the old session; temporary network failures retain the latest refresh token for retry. A generation counter prevents a completed refresh or queued read from restoring tokens after logout/account change. Status responses, notifications, service Intents and logs contain no bearer/refresh tokens. Native Auth accepts only the pinned production Supabase origin and a publishable/anon key; it never accepts a service-role/secret API key or follows credential-bearing redirects.

Remote session revocation is detected when Supabase rejects a GPS request or token renewal; the existing access-token validity window still applies. Local sign-out and verified Offline state stop the service directly. This change does not add a new server-side instant-revocation mechanism.

Location observations remain in memory only; this feature does not introduce a location-history queue or database migration. Going Offline retains the current encrypted sign-in session for ordinary app use; signing out clears it.

## Android settings and device verification

Settings show actual service activity, last server-acknowledged upload, location availability and battery-optimization status. The **Android settings** button opens Biloo Driver's application settings so the owner can allow background battery use. It does not silently exempt the app from battery optimization. OEM restrictions, Android force-stop, disabled GPS and missing connectivity can still interrupt tracking; stale Drivers are excluded from matching until a fresh verified fix returns.

Build/unit results are not real-phone locked-screen evidence. Before calling this device-verified, use the updated installed APK on representative Samsung/Tecno/Infinix devices and record:

1. Go Online, confirm the foreground-service notification and a server-acknowledged fresh fix. Lock the phone and stay stationary outdoors for at least 20 minutes; observe genuine new server GPS stamps and matching eligibility throughout.
2. Repeat while moving. Check Rider/Driver maps against actual motion; unavailable or inaccurate fixes must not animate fabricated movement.
3. Keep the screen locked beyond an access-token lifetime (typically test for 90 minutes), then reopen the app. GPS uploads should continue through native token rotation, and the same account should resume without a stale-refresh-token sign-out.
4. Disable data/Wi-Fi, wait, then restore connectivity while locked. Uploads should resume from a fresh observation; no old path should be replayed. The Rider map should show stale/unavailable context during the outage.
5. Go Offline and sign out separately. Confirm the service/notification stop and no later GPS uploads occur. Also test account suspension or session revocation while locked.
6. Disable/restore Location and test precise versus approximate permission. Test Android's foreground-service Stop control, force-stop, process recreation and battery restrictions; reopening must reconcile rather than silently resurrect an old shift.
7. Confirm the Rider APK never registers the Driver location service or uses the Driver native session store. Test login, token refresh, account switching and logout in web/PWA as well.

The current development checks cover native session renewal/revocation, logout/account-switch races, SDK/native token handoff, generation of both APK roles, release compilation, native unit tests and Android lint. Android Keystore behavior, actual locked-screen delivery, Doze and OEM battery policies still require the physical-device checks above.

The wider `npm test` suite has four pre-existing failures in Account visual assertions, footer class assertions and role icon distinction. The same four failures were reproduced from unchanged baseline `35af0ff`; they are separate from the GPS/session checks.

References: [location foreground services](https://developer.android.com/develop/background-work/services/fgs/service-types#location), [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [wake-lock guidance](https://developer.android.com/develop/background-work/background-tasks/awake/wakelock/best-practices), [Supabase sessions](https://supabase.com/docs/guides/auth/sessions).

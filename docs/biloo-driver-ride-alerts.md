# BILOO Driver native ride alerts

The Android Driver wrapper registers `BilooDriverRideAlerts` and owns incoming-request notifications without a running WebView. Eligible new installations advertise `alertProtocol: 1` when registering their Firebase device. The push worker keeps the legacy notification payload for older APKs and uses a data-only, high-priority payload for the new native receiver.

Android renders the heads-up notification and its Accept/Decline controls. The expanded content uses BILOO navy/gold, real pickup/payout data when available, and a native countdown. Private lock-screen content has a generic public version. There are no overlay, exact-alarm or full-screen-intent permissions, no simulated phone calls, and no new foreground service.

On Android 8+, the system notification timeout bounds insistent sound/vibration to the remaining offer lifetime, at most 30 seconds. Android may silence it when its notification shade opens, or according to channel, audio-focus, DND and device settings. Android 7 receives a finite chime without an unbounded repeating flag. The OS and FCM do not guarantee delivery after an explicit Force stop or when connectivity/permissions prevent delivery.

## State and security

- Deadlines and at most 64 offer tombstones survive process recreation. Duplicates cannot extend ringing. A late closure for an older offer cannot cancel a newer request.
- Closing, reassignment, cancellation, driver unavailability and account suspension enqueue terminal commands through the existing private outbox. An asynchronous post-commit wake invokes the existing protected worker; the existing cron remains a retry fallback.
- Native and WebView audio have one owner. Native channel muting never falls back to browser audio. Showing the request page does not restart a notification the driver has opened.
- Notification actions are explicit immutable PendingIntents with private, single-use nonces. They wait for Android/app unlock, bind to the current account, and then invoke the existing authenticated, atomic offer RPC. Raw web URLs cannot supply an automatic Accept/Decline command.
- Declining through a notification records the existing `other` reason. An uncertain action is not automatically replayed.
- Logging out clears the native binding and pending action. Rebinding a device token removes another account's old registration. Token rotation invalidates the readiness marker and the existing registration lifecycle reconciles it on resume.
- Provider acceptance is reported as `acceptedByFcm`, not delivery. Local displayed/opened counters remain separate and contain no rider, location or token data.

## Driver controls

Driver settings show notification/channel, sound, vibration, registration and background-battery status. A clearly labeled five-second local device test does not create a ride or send a server push. It does not certify FCM delivery. Existing Android notification and battery settings remain user controlled; BILOO does not change system volume or bypass DND.

## Release and validation

Run `npm run test:android`, `npm run build`, and the Android pipeline's real `testReleaseUnitTest lintRelease assembleRelease` jobs. The native JUnit suite covers persisted deadlines, expiry, duplicates, cancellation ordering, account switches, offline state and bounded tombstones. TypeScript tests cover the actual worker payload/eligibility paths, the native action handoff and single audio ownership.

A web deployment updates the server/UI only. The installed Driver APK must also be rebuilt with the existing package and signing identity. Older APKs keep the compatible basic notification until updated. Do not substitute a newly generated signing key for an existing release identity.

Physical-device acceptance remains necessary: TECNO/HiOS and a standard Android device, foreground/other-app/locked/screen-off states, Doze, recent-app dismissal, process recreation, denied permissions, muted channels, DND, delayed pushes, cancellation and multi-device acceptance. Record platform restrictions and untested cases; build success alone is not proof that a phone rang.

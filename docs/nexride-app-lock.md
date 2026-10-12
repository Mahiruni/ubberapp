# NexRide App Lock

The Rider and Driver Android builds share a native gate created in MainActivity
before the first rendered frame. No JavaScript API can unlock the gate, set a
credential, or disable protection. Settings → App Lock and Account → Security
open native settings after requesting recent account password verification.

## Supported behavior

- Optional six-digit PIN or nine-dot pattern, confirmed twice. Repeated and
  sequential PINs are rejected; patterns require four distinct dots and include
  skipped intermediate dots. PIN provides the accessible keypad alternative.
- AndroidX BiometricPrompt uses only BIOMETRIC_STRONG. Android chooses the
  available enrolled fingerprint or Class 3 face authenticator; common Class 2
  camera face unlock is deliberately unavailable. Enrollment and unlocking use
  an auth-per-use Android Keystore AES-GCM CryptoObject. Enrollment changes
  invalidate the key and require PIN/pattern followed by biometric enrollment.
- Immediate, 30-second, one-minute or five-minute background locking. Fresh
  launches always lock. A native privacy cover appears on pause even within the
  grace period; FLAG_SECURE suppresses app previews/screenshots while protected.
- Background location, push and trip services are not stopped by app locking.
  Foreground active rides stay unlocked without an additional setting. Return
  after the configured timeout requires unlock and resumes the existing page.
- PIN/pattern failures have progressive persistent delays starting at the fifth
  failure: 30 seconds, doubling to a maximum of 15 minutes. Monotonic time and
  Android boot count prevent a restart, reboot or wall-clock change bypass.
- Recovery verifies the password for the same stored account ID, then requires
  setting a new PIN or pattern. Cancelling recovery remains locked. It never
  restores an account session. Normal session expiry and explicit sign-out
  continue to be handled by the existing app authentication.
- The emergency button opens the system dialer without exposing trip/account
  information. Account password recovery opens the existing website recovery
  route in the browser.

## Storage and identity boundary

PBKDF2-HMAC-SHA256 uses a random 32-byte salt, 600,000 iterations and a 256-bit
verifier. PINs/patterns are never sent to a server or stored in localStorage.
Credential verifiers, owner ID, settings and retry counters are encrypted with
an app-private Android Keystore AES-GCM key. Android backups are disabled.
Damaged/missing keys with existing encrypted state fail closed; reinstalling and
normal account sign-in are required and local drafts are lost.

Native password verification calls the pinned NexRide Supabase project over
HTTPS. Settings additionally verify the existing access token via Auth `/user`.
The ephemeral password-check session is locally revoked and never returned to
the WebView or saved. Credentials and tokens are not logged. Verified MFA
factors cause password-only setup/recovery to be refused rather than bypassed;
MFA and CAPTCHA completion inside the native verification UI are not implemented.
Existing Supabase Auth rate limits remain authoritative.

An app UI lock is not a substitute for account authentication, authorization,
server RLS, device screen lock, or protection against a rooted/compromised device.
The existing WebView session-storage design is preserved.

## Platform scope and release verification

This repository generates Android shells and has no iOS native project. Browser
and iOS app locks are not offered. WebAuthn account authentication is a separate
feature and is not simulated as local app protection. Older APKs show an update
message instead of a fake lock control. The web deployment alone does not add
the native gate: users must install the new role-specific APK.

`setup-android-app-lock.mjs` installs the native source, lifecycle hooks,
biometric dependency, manifest hardening and executable JUnit security rules
tests into both role builds. Android CI runs `testDebugUnitTest assembleDebug`.
The web bridge is covered by Vitest. Existing browser regression checks must
remain green before merge.

Physical-device acceptance remains necessary for fingerprint/strong face
success, enrollment invalidation, cancellation/OS lockout, TalkBack, app-switcher
privacy, process termination, background GPS during a real ride and deep-link /
notification return. APK compilation and JVM tests do not prove those behaviors.

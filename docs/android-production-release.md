# NexRide Android v2.0.0 — first production-signed release

This release ships **two** production-signed APKs, one for `com.nexride.rider`
and one for `com.nexride.driver`. Both must pass signature and role/version
validation before the release job publishes GitHub assets.

## Required owner-only setup — before merging the security release PR

1. In the `Mahiruni/ubberapp` repository open **Settings → Environments**.
   Create or review the environment named **`android-production`**.
   Restrict it to the protected `main` branch. Add a required approver
   for production release access where supported.
2. Use an **existing production signing key** if the Rider or Driver app has
   already been distributed under that key. Changing Android signing certs
   generally prevents in-place upgrades. If no production key exists,
   generate a new, persistent keystore locally in an environment you control.
3. Add the following four **environment secrets**, not plain repository files:

   - `NEXRIDE_ANDROID_RELEASE_KEYSTORE_BASE64` — full binary keystore encoded
     using standard Base64; do not append extra output or quotes.
   - `NEXRIDE_ANDROID_RELEASE_STORE_PASSWORD`
   - `NEXRIDE_ANDROID_RELEASE_KEY_ALIAS`
   - `NEXRIDE_ANDROID_RELEASE_KEY_PASSWORD`

4. Optionally set environment variable `NEXRIDE_ANDROID_RELEASE_CERT_SHA256`
   to the known certificate digest for continuity; if populated, any key
   substitution causes the job to fail. This fingerprint is **not** a secret.
5. Back up the keystore and its passwords separately in a secured password
   manager or offline vault. Losing this key may prevent future updates.

### New keystore example (only if no production signing key exists)

Use a trusted machine with a current JDK:

```bash
keytool -genkeypair -v -keystore nexride-production.jks -storetype JKS \
  -alias nexride-prod -keyalg RSA -keysize 3072 -validity 10000 \
  -dname "CN=NexRide, O=NexRide, C=ET"
keytool -list -v -keystore nexride-production.jks -alias nexride-prod
# Linux: output the Base64 encoding locally, then securely enter it in
# GitHub's environment secret form (never commit or send the value in chat).
base64 -w 0 nexride-production.jks
```

Use the same JKS, alias, and passwords for both Android roles in this
workflow; each app still has a separate package identity. To use separate
keys later, split the signing secrets by role and pin both certificates.

## Release and checks

The production workflow runs on the merge commit when
`.github/workflows/android-production-release.yml` first reaches main;
it can also be started manually from **Actions → NexRide — Production Signed
Android APKs → Run workflow** on main.

Before publication, both matrix jobs must:

- Assemble native `release` binaries (`assembleRelease`) with **the protected
  production keystore**, not debug signing.
- Run Android security unit tests and the NexRide native bridge checks.
- Confirm APK Signature Scheme v2 with `apksigner verify`.
- Validate exact application IDs, Android `versionCode=20261014` and
  `versionName=2.0.0`.
- Optionally compare the signer certificate against the pinned digest.
- Generate `SHA256SUMS.txt` and upload signed APK artifacts.

When both jobs succeed, the publishing job creates the GitHub release
`android-v2.0.0` with:

- `NexRide-rider-v2.0.0-release.apk`
- `NexRide-driver-v2.0.0-release.apk`
- `SHA256SUMS.txt`

If any signing secret is unavailable, the workflow must **fail closed**.
Do not substitute a debug or ephemeral CI-generated keystore.

## Activating retirement of earlier Android wrappers

Release gating is initially OFF to prevent forced updates before the new
signed APKs are accessible. **After both signed APKs are published and
successfully installed/tested**, enable the Vercel production build variable
`NEXT_PUBLIC_NEXRIDE_RETIRE_LEGACY_ANDROID=true` and redeploy production.

This blocks the UI of original Capacitor Android wrappers that do not
include the native release-identity plugin. It deliberately does not block
the website/PWA. It is **not cryptographic app attestation** or a guarantee
against direct authenticated requests; Supabase authorization, sensitive
endpoint checks, revocation of compromised sessions, and Android Play
Integrity or comparable attestation remain separate security tasks.

Avoid deleting user accounts or cloud trip data during rollout. Existing
debug-signed Android installs may need to be uninstalled before installing
these release-signed APKs. Advise users that unsynced local drafts/settings
can be lost on uninstall.

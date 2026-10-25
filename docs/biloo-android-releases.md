# Biloo Android releases

Biloo ships separate Rider (`com.nexride.rider`) and Driver (`com.nexride.driver`) applications. These package IDs are retained so release builds can update an existing installation signed with the same certificate. Display names remain Biloo Rider and Biloo Driver.

## Build verification

`.github/workflows/android-apks.yml` generates a fresh native project for each role from the tracked `native/android` templates and preparation scripts. Generated projects are intentionally ignored by Git. Capacitor dependencies are pinned in the lockfile; the workflow uses Node 24, Java 21, Android SDK 36, build-tools 36.0.0, and a checksum-verified Gradle 8.14.3 distribution. All first-party Actions are pinned to commit hashes.

Native changes on `main` and pull requests compile, test and lint **both release variants**. Those jobs receive no signing or Firebase secrets. Their `UNSIGNED-VERIFICATION.apk` artifacts prove compilation and package metadata; they are not installable production releases. Only test/lint reports and explicitly verified APK output are uploaded, never the generated Android source project or signing material.

For a local build, use a fresh checkout per role with Java 21 and the Android SDK installed:

```sh
npm ci
npm run test:android
npm run android:prepare -- rider 42
cd android
./gradlew --no-daemon --max-workers=2 testReleaseUnitTest lintRelease assembleRelease
```

Use `driver` in a separate checkout for the other application. Preparation refuses to overwrite an existing `android/` directory. Recreate the generated workspace after changing templates; do not edit it as the source of truth. The final argument is the build number. Local verification builds must not be distributed as production updates.

## Versioning

`native/android/release.json` owns the public version name, SDK versions and role identity. The APK version code is `versionCodeBase + GITHUB_RUN_NUMBER` (currently `100000 + run number`). Both roles in a run share a version code; retrying that run preserves its identity. New workflow runs increment it. Preserve the workflow filename/counter and never lower the base or reuse an already distributed version code for a changed APK. Update `versionName` intentionally for a public release. Android requires the next update's version code to exceed the installed release.

## Configure the existing signing identity

The pipeline does not create production keys. Reuse each application's existing production keystore and retain an independent backup. If no production key has ever been established, its owner must create and back up the first release identity before configuring this workflow. Do not replace a published signing key to make CI pass.

In this repository's **Settings → Secrets and variables → Actions**, configure these values for each role:

| Setting | Rider | Driver |
| --- | --- | --- |
| Secret: Base64 of existing keystore file | `BILOO_RIDER_KEYSTORE_BASE64` | `BILOO_DRIVER_KEYSTORE_BASE64` |
| Secret: keystore password | `BILOO_RIDER_STORE_PASSWORD` | `BILOO_DRIVER_STORE_PASSWORD` |
| Secret: key alias | `BILOO_RIDER_KEY_ALIAS` | `BILOO_DRIVER_KEY_ALIAS` |
| Secret: key password | `BILOO_RIDER_KEY_PASSWORD` | `BILOO_DRIVER_KEY_PASSWORD` |
| Variable: expected public signing certificate SHA-256 | `BILOO_RIDER_CERT_SHA256` | `BILOO_DRIVER_CERT_SHA256` |
| Secret: production Firebase `google-services.json`, Base64 | `NEXRIDE_RIDER_GOOGLE_SERVICES_BASE64` | `NEXRIDE_DRIVER_GOOGLE_SERVICES_BASE64` |

The public certificate fingerprint comes from `keytool -list -v -keystore /path/to/existing.keystore -alias YOUR_ALIAS` (enter the password at its prompt). Use the SHA-256 of the certificate that signs the installed APK. With Play App Signing, the upload certificate and Play's installation certificate can differ: a directly distributed APK must match the certificate of the installation it updates. Passwords and keystore files belong in private secret storage, never in Git, issue comments or chat. Base64 is encoding, not encryption.

The existing Firebase validator checks the selected package ID and Android configuration format before writing the temporary native configuration. The final APK verifier also requires compiled Firebase app and sender resources. No Rider key or Firebase setting is used as a fallback for missing Driver configuration.

## Produce signed APKs

1. Open **Actions → Biloo Android release pipeline → Run workflow** on `main`.
2. Enable **Build signed release APKs using the existing Rider/Driver signing keys**.
3. Both unsigned release checks must pass before either signing job starts.
4. Download each `Biloo-<role>-signed-release-<run>` artifact. It contains the APK, a SHA-256 checksum and public `release-manifest.json`.

The signing step opens the supplied existing keystore, checks its certificate against the configured fingerprint, and writes it only to a private temporary directory. Gradle reads passwords from step environment variables. The final verification checks the compiled package ID, version, HTTPS role entry point, release flags, Firebase resource presence and the APK's actual v2/v3 signing certificate. A mismatch fails the job. Temporary signing material is removed after the job. Secret-bearing jobs run only for a deliberate manual release on `main`.

This phase produces APK artifacts. It does not publish a GitHub Release, upload an Android App Bundle to Google Play, or update the website's download links. Artifact retention is 30 days for signed output and 7 days for verification output; archive approved releases separately before they expire.

## Installation and device validation

An APK signed by a new release certificate cannot update an old debug-signed installation. Ephemeral GitHub runner debug keys from the former workflow are not a production signing identity. Resolve that migration deliberately and preserve any required device data; do not erase a user's installation automatically.

A passing native build and signature check do not prove device behavior. Before public distribution, install both release APKs on representative Android devices and verify login/session restoration, notification permission and delivery, Driver location service, keyboard/insets, Back navigation, day/night system bars, active-trip recovery and poor connectivity. A successful Vercel deployment validates only the hosted web application. Record device evidence and signing certificate identity with the approved release.

References: [Android signing](https://developer.android.com/studio/publish/app-signing), [Android versioning](https://developer.android.com/studio/publish/versioning).

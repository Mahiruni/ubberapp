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

## First signed release

For Biloo's first signed releases, run `scripts/create-android-release-keys.py` **on your own computer**. It creates a separate encrypted PKCS#12 keystore for Rider and Driver, with RSA 3072-bit keys and 10,000-day certificate validity. The keys remain outside Git. Python 3.9+ and Java 21 (`keytool`) are required; GitHub configuration also needs [GitHub CLI](https://cli.github.com/) authenticated to `github.com` with permission to manage this repository's Actions settings.

Choose a private local directory and a separate backup location, preferably on an encrypted external drive. Replace the backup path below with your real backup location:

```sh
python3 scripts/create-android-release-keys.py --output-dir "$HOME/BilooKeys" --backup-dir "/your/backup/BilooKeys"
```

You enter and confirm a password of at least 16 characters for each app at hidden terminal prompts. Keep both passwords in your password manager. The command saves the two password-protected keystores and a public `release-identities.json` record in **both** directories and verifies that the backup bytes match. It does not contact GitHub by default. Key/backup directories must be separate, non-nested, and outside every Git checkout. Store the backup somewhere that survives loss of the original computer; two directories on the same disk do not provide that protection.

The files are `biloo-rider-release.p12` (alias `biloo-rider-release`) and `biloo-driver-release.p12` (alias `biloo-driver-release`). The keystore and private key use the same password for each app, as expected by the PKCS#12 signing setup. Passwords are not written to the identity record or passed in command arguments.

After checking your saved files, run the same command with the same directories and passwords plus `--configure --start-release`:

```sh
python3 scripts/create-android-release-keys.py --output-dir "$HOME/BilooKeys" --backup-dir "/your/backup/BilooKeys" --configure --start-release
```

This reuses the saved keys, configures both apps' signing secrets and certificate variables through `gh`, checks that both role-specific Firebase secret names exist, then requests the signed APK workflow on `main`. The build still validates the actual Firebase configurations and APK signatures. `--configure` alone uploads the settings without starting a build. Follow the run at [GitHub Actions](https://github.com/Mahiruni/ubberapp/actions) and download the verified signed artifacts after it succeeds.

Interrupted setup can be resumed with the same directories and passwords. Missing originals are restored from their verified backup. A missing backup can be recreated from the original. If an identity is recorded but both key files are lost, the command refuses to generate a replacement. It also refuses to overwrite differing backups or change an already pinned GitHub certificate. If GitHub configuration fails after key creation, preserve these files and rerun the same command; do not generate a different identity to retry.

The assistant's GitHub connection cannot set Actions secrets or dispatch this manual release workflow, so this owner-run step is required. No production signing key is created in the assistant workspace or saved to the repository. Automated tests generate temporary keys only.

## Configure the existing signing identity

The CI pipeline does not create production keys. Reuse each application's existing production keystore and retain an independent backup. If no production key has ever been established, use the first-release procedure above. Do not replace a published signing key to make CI pass.

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

### Configure signing from your computer

The setup helper reads an **existing** keystore on your computer. It never creates a replacement production key. You need Python 3 and Java's `keytool`; uploading the settings also requires [GitHub CLI](https://cli.github.com/) authenticated to `github.com` with permission to manage this repository's Actions settings.

From your checkout, first verify the Rider key locally:

```sh
python3 scripts/configure-android-release.py --role rider --keystore "/path/to/rider-release.jks" --alias "YOUR_ALIAS"
```

Passwords are entered at hidden terminal prompts. Enter an empty key password only when it matches the keystore password. The command checks actual private-key access and shows the public certificate fingerprint and setting names. This default mode does not contact GitHub or change its settings. Compare the fingerprint with the established release certificate described above.

To upload the checked settings, run the same command with `--apply --expected-cert "YOUR_CERTIFICATE_SHA256"`:

```sh
python3 scripts/configure-android-release.py --role rider --keystore "/path/to/rider-release.jks" --alias "YOUR_ALIAS" --apply --expected-cert "YOUR_CERTIFICATE_SHA256"
```

Repeat for `--role driver` with the Driver keystore and certificate. The helper writes only that role's four signing secrets and certificate variable to `github.com/Mahiruni/ubberapp`. It rejects debug keys, unusable private keys, mismatched fingerprints and replacement of an already pinned certificate. Secret values go to `gh` through standard input, never command arguments or generated configuration files. The CLI performs secret encryption before upload ([official command reference](https://cli.github.com/manual/gh_secret_set)). Firebase settings are configured separately using the table above.

These GitHub writes are separate API operations. If a network or permission failure interrupts them, rerun with the same certificate to finish; the helper reports failure rather than claiming all settings are ready. It does not automatically start a workflow or publish an APK.

## Produce signed APKs

1. Open **Actions → Biloo Android release pipeline → Run workflow** on `main`.
2. Enable **Build signed release APKs using the existing Rider/Driver signing keys**.
3. Both unsigned release checks must pass before either signing job starts.
4. Download each `Biloo-<role>-signed-release-<run>` artifact. It contains the APK, a SHA-256 checksum and public `release-manifest.json`.

After both roles and Firebase settings are configured, the equivalent CLI command is:

```sh
gh workflow run android-apks.yml --repo github.com/Mahiruni/ubberapp --ref main -f signed_release=true
```

The signing step opens the supplied existing keystore, checks its certificate against the configured fingerprint, and writes it only to a private temporary directory. Gradle reads passwords from step environment variables. The final verification checks the compiled package ID, version, HTTPS role entry point, release flags, Firebase resource presence and the APK's actual v2/v3 signing certificate. A mismatch fails the job. Temporary signing material is removed after the job. Secret-bearing jobs run only for a deliberate manual release on `main`.

This phase produces APK artifacts. It does not publish a GitHub Release, upload an Android App Bundle to Google Play, or update the website's download links. Artifact retention is 30 days for signed output and 7 days for verification output; archive approved releases separately before they expire.

## Installation and device validation

An APK signed by a new release certificate cannot update an old debug-signed installation. Ephemeral GitHub runner debug keys from the former workflow are not a production signing identity. Resolve that migration deliberately and preserve any required device data; do not erase a user's installation automatically.

A passing native build and signature check do not prove device behavior. Before public distribution, install both release APKs on representative Android devices and verify login/session restoration, notification permission and delivery, Driver location service, keyboard/insets, Back navigation, day/night system bars, active-trip recovery and poor connectivity. A successful Vercel deployment validates only the hosted web application. Record device evidence and signing certificate identity with the approved release.

The Driver locked-screen tracking implementation and physical-device test procedure are documented in [Driver GPS with the screen locked](biloo-locked-screen-gps.md).

References: [Android signing](https://developer.android.com/studio/publish/app-signing), [Android versioning](https://developer.android.com/studio/publish/versioning).

import fs from "node:fs";
import path from "node:path";

// Called only in a protected GitHub Actions production signing job.
// The JKS is created in RUNNER_TEMP from an Actions secret, never committed.
const role = process.argv[2];
if (!["rider", "driver"].includes(role)) {
  throw new Error("Expected rider or driver");
}
for (const name of [
  "NEXRIDE_RELEASE_KEYSTORE_PATH",
  "NEXRIDE_RELEASE_STORE_PASSWORD",
  "NEXRIDE_RELEASE_KEY_ALIAS",
  "NEXRIDE_RELEASE_KEY_PASSWORD",
]) {
  if (!process.env[name]) throw new Error("Missing required release signing environment variable: " + name);
}
const store = process.env.NEXRIDE_RELEASE_KEYSTORE_PATH;
if (!fs.statSync(store).isFile()) throw new Error("Android release keystore is not a file");

// Capacitor creates this file from its standard Android template at build time.
// Keep signing details out of the tracked repository and avoid extra Gradle CLI
// -P secrets (which would be visible in process lists).
const gradle = path.join("android", "app", "build.gradle");
const original = fs.readFileSync(gradle, "utf8");
if (original.includes("NEXRIDE_PRODUCTION_SIGNING")) {
  throw new Error("Release signing configuration has already been installed");
}
if (!original.includes("com.android.application") || !original.includes("buildTypes")) {
  throw new Error("Unrecognized Capacitor Android Gradle build file");
}
const snippet = `
 
// NEXRIDE_PRODUCTION_SIGNING: Values are supplied only by the protected CI job.
// Never use the debug signing certificate for an official APK.
android {
  signingConfigs {
    nexrideProduction {
      storeFile file(System.getenv("NEXRIDE_RELEASE_KEYSTORE_PATH"))
      storePassword System.getenv("NEXRIDE_RELEASE_STORE_PASSWORD")
      keyAlias System.getenv("NEXRIDE_RELEASE_KEY_ALIAS")
      keyPassword System.getenv("NEXRIDE_RELEASE_KEY_PASSWORD")
      enableV1Signing true
      enableV2Signing true
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.nexrideProduction
    }
  }
}
`;
fs.writeFileSync(gradle, original + snippet);
console.log("Configured release signing for NexRide " + role + " (secret values omitted).");

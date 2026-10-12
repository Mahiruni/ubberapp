import fs from "node:fs";
import path from "node:path";

const role = process.argv[2];
if (!["rider", "driver"].includes(role)) throw Error("role must be rider or driver");
const base = "android/app/src/main";
const folder = path.join(base, "java/com/nexride", role);
for (const name of ["NexRideAppLock.java", "NexRideAppLockPlugin.java", "NexRideLockRules.java"]) {
  fs.writeFileSync(path.join(folder, name), fs.readFileSync(path.join("native/android", name), "utf8")
    .replaceAll("com.nexride.APP_ROLE", `com.nexride.${role}`));
}
const tests = path.join("android/app/src/test/java/com/nexride", role);
fs.mkdirSync(tests, { recursive: true });
fs.writeFileSync(path.join(tests, "NexRideLockRulesTest.java"), fs.readFileSync("native/android/test/NexRideLockRulesTest.java", "utf8")
  .replaceAll("com.nexride.APP_ROLE", `com.nexride.${role}`));
const main = path.join(folder, "MainActivity.java");
let source = fs.readFileSync(main, "utf8");
if (!source.includes("NexRideAppLock nexRideAppLock")) {
  source = source.replace("public class MainActivity extends BridgeActivity {", `public class MainActivity extends BridgeActivity {
  public NexRideAppLock nexRideAppLock;
  @Override public void onPause() {
    if (nexRideAppLock != null) nexRideAppLock.pause();
    super.onPause();
  }
  @Override public void onResume() {
    super.onResume();
    if (nexRideAppLock != null) nexRideAppLock.resume();
  }
  @Override public void onDestroy() {
    if (nexRideAppLock != null) nexRideAppLock.destroy();
    super.onDestroy();
  }
`);
  source = source.replace("super.onCreate(savedInstanceState);", `registerPlugin(NexRideAppLockPlugin.class);
    getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
    super.onCreate(savedInstanceState);
    nexRideAppLock = new NexRideAppLock(this);
    getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
      @Override public void handleOnBackPressed() {
        if (nexRideAppLock.consumesBack()) nexRideAppLock.back();
        else {
          setEnabled(false);
          getOnBackPressedDispatcher().onBackPressed();
          setEnabled(true);
        }
      }
    });`);
}
if (!source.includes("nexRideAppLock = new NexRideAppLock(this)")) throw Error("Native startup gate was not installed");
fs.writeFileSync(main, source);
const gradle = "android/app/build.gradle";
let build = fs.readFileSync(gradle, "utf8");
if (!build.includes("androidx.biometric:biometric:")) build += '\ndependencies { implementation "androidx.biometric:biometric:1.1.0" }\n';
if (!build.includes("junit:junit:")) build += '\ndependencies { testImplementation "junit:junit:4.13.2" }\n';
fs.writeFileSync(gradle, build);
const manifest = path.join(base, "AndroidManifest.xml");
let xml = fs.readFileSync(manifest, "utf8");
if (!xml.includes('android:name="android.permission.USE_BIOMETRIC"')) xml = xml.replace("<application", '<uses-permission android:name="android.permission.USE_BIOMETRIC" />\n    <application');
xml = xml.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
if (!xml.includes('android:allowBackup=')) xml = xml.replace("<application", '<application android:allowBackup="false"');
xml = xml.replace(/android:fullBackupContent="[^"]*"/, 'android:fullBackupContent="false"');
fs.writeFileSync(manifest, xml);

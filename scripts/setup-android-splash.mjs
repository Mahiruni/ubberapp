/** One violet/white Android launch screen, released when web content is ready.
 * Run after cap sync: node scripts/setup-android-splash.mjs rider|driver [android-dir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const role = process.argv[2];
if (!["rider", "driver"].includes(role)) throw Error("Expected rider or driver");
const res = join(process.argv[3] || "android", "app/src/main/res");
const stylePath = join(res, "values/styles.xml");
let styles = readFileSync(stylePath, "utf8");
if (!styles.includes('name="AppTheme.NoActionBarLaunch"')) throw Error("Capacitor launch theme missing");

const drawable = join(res, "drawable-nodpi");
mkdirSync(drawable, { recursive: true });
// Android masks the icon to a circle. The text fits inside its safe central area.
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="864" height="864" viewBox="0 0 288 288"><text x="144" y="151" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="bold" letter-spacing="-1.3" fill="white">Biloo</text></svg>`))
  .png().toFile(join(drawable,"nexride_splash_wordmark.png"));
styles = styles.replace(/<style name="AppTheme.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/,
  `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#08295F</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/nexride_splash_wordmark</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:statusBarColor">#08295F</item>
        <item name="android:navigationBarColor">#08295F</item>
    </style>`);
writeFileSync(stylePath, styles);
// Same art if a device needs Capacitor's legacy fallback path.
const legacyDrawable = join(res, "drawable");
mkdirSync(legacyDrawable, { recursive: true });
writeFileSync(join(legacyDrawable, "nexride_launch.xml"), `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item><shape android:shape="rectangle"><solid android:color="#08295F" /></shape></item>
  <item android:width="288dp" android:height="288dp" android:gravity="center" android:drawable="@drawable/nexride_splash_wordmark" />
</layer-list>\n`);
for (const qualifier of ["values-v27", "values-v31"]) {
const versioned = join(res, qualifier);
mkdirSync(versioned,{recursive:true});
writeFileSync(join(versioned,"nexride-splash.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#08295F</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/nexride_splash_wordmark</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
        <item name="android:statusBarColor">#08295F</item>
        <item name="android:navigationBarColor">#08295F</item>
    </style>
</resources>\n`);
}
console.log(`Configured single native violet/white Biloo ${role} launch theme.`);

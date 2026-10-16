/** Brand Android's supported launch theme without holding startup on a timer.
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
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="864" height="864" viewBox="0 0 288 288"><text x="144" y="151" text-anchor="middle" font-family="sans-serif" font-size="34" font-weight="bold" letter-spacing="-1.3" fill="white">NexRide</text><rect x="127" y="171" width="34" height="4" rx="2" fill="#FFFFFF"/></svg>`))
  .png().toFile(join(drawable,"nexride_splash_wordmark.png"));
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="240" viewBox="0 0 320 80"><text x="160" y="32" text-anchor="middle" font-family="sans-serif" font-size="14" fill="white">Better Rides. A Brighter Tomorrow.</text><text x="160" y="55" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#FFFFFF">NexRide ${role === "driver" ? "Driver" : "Rider"}</text></svg>`))
  .png().toFile(join(drawable,"nexride_splash_tagline.png"));
styles = styles.replace(/<style name="AppTheme.NoActionBarLaunch"[^>]*>[\s\S]*?<\/style>/,
  `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#000000</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/nexride_splash_wordmark</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:statusBarColor">#000000</item>
        <item name="android:navigationBarColor">#000000</item>
    </style>`);
writeFileSync(stylePath, styles);
const v31 = join(res,"values-v31");
mkdirSync(v31,{recursive:true});
writeFileSync(join(v31,"nexride-splash.xml"), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">#000000</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/nexride_splash_wordmark</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
        <item name="android:windowSplashScreenBrandingImage">@drawable/nexride_splash_tagline</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:statusBarColor">#000000</item>
        <item name="android:navigationBarColor">#000000</item>
    </style>
</resources>\n`);
console.log(`Configured native true-black NexRide ${role} launch theme.`);

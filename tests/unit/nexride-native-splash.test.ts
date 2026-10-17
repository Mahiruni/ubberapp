import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));

test.each(["rider", "driver"])("%s native splash preserves runtime theme and fits Android's icon mask", async role => {
  const dir = mkdtempSync(join(tmpdir(), "nexride-launch-")); dirs.push(dir);
  const res = join(dir,"app/src/main/res");
  mkdirSync(join(res,"values"),{recursive:true});
  const runtime = '<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.NoActionBar"><item name="colorPrimary">#00C878</item></style>';
  writeFileSync(join(res,"values/styles.xml"), `<resources>${runtime}<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen"><item name="android:background">@drawable/splash</item></style></resources>`);
  execFileSync(process.execPath,["scripts/setup-android-splash.mjs",role,dir]);
  const first = readFileSync(join(res,"values/styles.xml"),"utf8");
  expect(first).toContain(runtime);
  expect(first).toContain('name="postSplashScreenTheme">@style/AppTheme.NoActionBar');
  expect(first).toContain('name="windowSplashScreenBackground">#625CF6');
  expect(first).not.toContain("setKeepOnScreenCondition");
  const icon = sharp(join(res,"drawable-nodpi/nexride_splash_wordmark.png"));
  const { data, info } = await icon.raw().toBuffer({ resolveWithObject: true });
  // A 288dp icon has a 192dp safe circle. Every visible pixel must fit it.
  for (let y=0;y<info.height;y++) for (let x=0;x<info.width;x++) {
    if (data[(y*info.width+x)*info.channels+3] > 0)
      {
        expect(Math.hypot(x-info.width/2,y-info.height/2)).toBeLessThan(info.width/3);
        const pixel = (y*info.width+x)*info.channels;
        expect([...data.subarray(pixel, pixel+3)]).toEqual([255,255,255]);
      }
  }
  const fallbackDrawable = readFileSync(join(res,"drawable/nexride_launch.xml"),"utf8");
  expect(fallbackDrawable).toContain('<solid android:color="#625CF6" />');
  expect(fallbackDrawable).not.toContain('android:drawable="#625CF6"');
  expect(readFileSync(join(res,"values-v31/nexride-splash.xml"),"utf8")).not.toContain("windowSplashScreenBrandingImage");
  expect(readFileSync(join(res,"values-v31/nexride-splash.xml"),"utf8")).toContain("windowSplashScreenBackground");
  execFileSync(process.execPath,["scripts/setup-android-splash.mjs",role,dir]);
  expect(readFileSync(join(res,"values/styles.xml"),"utf8")).toBe(first);
});

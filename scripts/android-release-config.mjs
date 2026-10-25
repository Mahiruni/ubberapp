import fs from 'node:fs';

export const androidRelease = JSON.parse(fs.readFileSync(new URL('../native/android/release.json', import.meta.url), 'utf8'));

export function releasePlan(role, runNumber) {
  if (!['rider', 'driver'].includes(role)) throw Error('Expected rider or driver');
  const run = Number(runNumber);
  if (!Number.isSafeInteger(run) || run < 1) throw Error('Build number must be a positive integer');
  const versionCode = androidRelease.versionCodeBase + run;
  if (!Number.isSafeInteger(versionCode) || versionCode > 2100000000) throw Error('Android versionCode exceeds the supported range');
  if (!/^\d+\.\d+\.\d+$/.test(androidRelease.versionName)) throw Error('Expected a semantic Android version name');
  return { role, ...androidRelease.roles[role], versionName: androidRelease.versionName, versionCode };
}

export function capacitorConfig(plan) {
  return {
    appId: plan.applicationId, appName: plan.name, webDir: 'public',
    loggingBehavior: 'none',
    server: { url: androidRelease.origin + plan.startPath, cleartext: false, androidScheme: 'https' },
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
    plugins: { SplashScreen: { launchAutoHide: true, launchShowDuration: 12000,
      launchFadeOutDuration: 160, backgroundColor: '#08295F', androidSplashResourceName: 'nexride_launch', showSpinner: false } },
  };
}

export function configureReleaseGradle(source, plan) {
  if (!source.includes(`applicationId "${plan.applicationId}"`)) throw Error('Generated Android package does not match the selected role');
  if (!/versionCode\s+\d+/.test(source) || !/versionName\s+"[^"]*"/.test(source)) throw Error('Unsupported Android version configuration');
  source = source.replace(/versionCode\s+\d+/, `versionCode ${plan.versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${plan.versionName}"`);
  // Passwords stay in environment variables. Never write them to Gradle files,
  // command arguments, the Android project artifact, or application resources.
  const start = '// BEGIN BILOO RELEASE SIGNING', end = '// END BILOO RELEASE SIGNING';
  if (source.includes(start)) source = source.slice(0, source.indexOf(start)) + source.slice(source.indexOf(end) + end.length);
  return source.trimEnd() + `\n\n${start}
def bilooSigningFile = System.getenv('BILOO_ANDROID_KEYSTORE_FILE')
if (bilooSigningFile) {
    def requiredSigningValues = ['BILOO_ANDROID_STORE_PASSWORD', 'BILOO_ANDROID_KEY_ALIAS', 'BILOO_ANDROID_KEY_PASSWORD']
    requiredSigningValues.each { name ->
        if (!System.getenv(name)) throw new GradleException('Missing Android signing setting: ' + name)
    }
    android.signingConfigs {
        bilooRelease {
            storeFile file(bilooSigningFile)
            storePassword System.getenv('BILOO_ANDROID_STORE_PASSWORD')
            keyAlias System.getenv('BILOO_ANDROID_KEY_ALIAS')
            keyPassword System.getenv('BILOO_ANDROID_KEY_PASSWORD')
        }
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.bilooRelease
}
android.buildTypes.release.debuggable = false
android.buildToolsVersion = '${androidRelease.buildTools}'
${end}\n`;
}

export function configureRootGradle(source) {
  const start = '// BEGIN BILOO SDK TOOLS', end = '// END BILOO SDK TOOLS';
  if (source.includes(start)) source = source.slice(0, source.indexOf(start)) + source.slice(source.indexOf(end) + end.length);
  // Capacitor's library modules otherwise use AGP's default build-tools version.
  return source.trimEnd() + `\n\n${start}
subprojects { project ->
    ['com.android.application', 'com.android.library'].each { plugin ->
        project.plugins.withId(plugin) {
            project.android.buildToolsVersion = '${androidRelease.buildTools}'
        }
    }
}
${end}\n`;
}

export function hardenManifest(xml) {
  for (const permission of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','CAMERA','POST_NOTIFICATIONS']) {
    if (!xml.includes(`android.permission.${permission}"`)) xml = xml.replace('<application', `<uses-permission android:name="android.permission.${permission}" />\n    <application`);
  }
  for (const feature of ['android.hardware.camera', 'android.hardware.camera.autofocus']) {
    if (!xml.includes(`android:name="${feature}"`)) xml = xml.replace('<application', `<uses-feature android:name="${feature}" android:required="false" />\n    <application`);
  }
  // Capacitor's template places INTERNET after the application element.
  const permissions = [...xml.matchAll(/<uses-permission\b[^>]*\/>/g)].map(match => match[0]);
  xml = xml.replace(/\s*<uses-permission\b[^>]*\/>/g, '').replace('<application', permissions.join('\n    ') + '\n    <application');
  for (const [attribute, value] of Object.entries({ usesCleartextTraffic: 'false', allowBackup: 'false', fullBackupContent: 'false', enableOnBackInvokedCallback: 'true' })) {
    const pattern = new RegExp(`android:${attribute}="[^"]*"`);
    xml = pattern.test(xml) ? xml.replace(pattern, `android:${attribute}="${value}"`) : xml.replace('<application', `<application android:${attribute}="${value}"`);
  }
  return xml;
}

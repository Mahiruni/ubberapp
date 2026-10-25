import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { androidRelease, releasePlan, capacitorConfig, configureReleaseGradle, configureRootGradle, hardenManifest } from './android-release-config.mjs';

const plan = releasePlan(process.argv[2], process.argv[3]);
const root = process.cwd();
const scripts = path.dirname(fileURLToPath(import.meta.url));
const execute = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw Error(`Android preparation failed: ${path.basename(command)} (exit ${result.status})`);
};
const run = (name, ...args) => execute(process.execPath, [path.join(scripts, name), ...args]);
if (fs.existsSync('android')) throw Error('An Android project already exists. Use a fresh checkout/workspace for each role; existing source was not overwritten.');

fs.writeFileSync('capacitor.config.json', JSON.stringify(capacitorConfig(plan), null, 2) + '\n');
run('harden-android-push-notifications.mjs');
execute(process.execPath, [path.resolve('node_modules/@capacitor/cli/bin/capacitor'), 'add', 'android']);
execute(process.execPath, [path.resolve('node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android']);
run('setup-android-splash.mjs', plan.role);
run('setup-android-reliability.mjs', plan.role);
run('setup-android-app-lock.mjs', plan.role);
run('sync-android-icons.mjs', plan.role);
if (plan.role === 'driver') execute('python3', [path.join(scripts, 'generate-nexride-alert-sound.py')]);

const manifest = 'android/app/src/main/AndroidManifest.xml';
fs.writeFileSync(manifest, hardenManifest(fs.readFileSync(manifest, 'utf8')));
const gradle = 'android/app/build.gradle';
fs.writeFileSync(gradle, configureReleaseGradle(fs.readFileSync(gradle, 'utf8'), plan));
const rootGradle = 'android/build.gradle';
fs.writeFileSync(rootGradle, configureRootGradle(fs.readFileSync(rootGradle, 'utf8')));
const variables = 'android/variables.gradle';
let variableText = fs.readFileSync(variables, 'utf8');
for (const [key, value] of Object.entries({ minSdkVersion: androidRelease.minSdk, compileSdkVersion: androidRelease.compileSdk, targetSdkVersion: androidRelease.targetSdk })) {
  variableText = variableText.replace(new RegExp(`${key} = \\d+`), `${key} = ${value}`);
}
fs.writeFileSync(variables, variableText);
const wrapper = 'android/gradle/wrapper/gradle-wrapper.properties';
let wrapperText = fs.readFileSync(wrapper, 'utf8');
wrapperText = wrapperText.replace(/^distributionUrl=.*$/m, `distributionUrl=https\\://services.gradle.org/distributions/gradle-${androidRelease.gradleVersion}-bin.zip`)
  .replace(/^distributionSha256Sum=.*\n?/m, '')
  .replace(/^networkTimeout=.*$/m, 'networkTimeout=120000');
fs.writeFileSync(wrapper, wrapperText.trimEnd() + `\ndistributionSha256Sum=${androidRelease.gradleSha256}\n`);
fs.writeFileSync('android/biloo-build.json', JSON.stringify(plan, null, 2) + '\n');
console.log(`Prepared ${plan.name} ${plan.versionName} (${plan.versionCode}), package ${plan.applicationId}`);

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { releasePlan, capacitorConfig, configureReleaseGradle, configureRootGradle, hardenManifest } from '../../scripts/android-release-config.mjs';

const temporary: string[] = [];
afterEach(()=>temporary.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));
describe('Biloo Android release identity',()=>{
  it('preserves separate installed package IDs and HTTPS role destinations',()=>{
    for(const role of ['rider','driver']){
      const plan=releasePlan(role,42), config=capacitorConfig(plan);
      expect(plan.applicationId).toBe(`com.nexride.${role}`);
      expect(plan.versionCode).toBe(100042);expect(config.server.url).toBe(`https://ubberapp.vercel.app/${role}`);
      expect(config.android).toMatchObject({allowMixedContent:false,webContentsDebuggingEnabled:false});
      expect(config.loggingBehavior).toBe('none');expect(config.server.cleartext).toBe(false);
    }
  });
  it('assigns strictly increasing codes while retries keep their original build identity',()=>{
    expect(releasePlan('rider',43).versionCode).toBeGreaterThan(releasePlan('rider',42).versionCode);
    expect(releasePlan('driver',42).versionCode).toBe(releasePlan('rider',42).versionCode);
    for(const value of [0,-1,1.5,NaN,Infinity,'text',2100000000])expect(()=>releasePlan('rider',value)).toThrow();
    expect(()=>releasePlan('admin',1)).toThrow();
  });
  it('keeps release signing outside source and rejects a mismatched package',()=>{
    const plan=releasePlan('rider',42),source='android { defaultConfig { applicationId "com.nexride.rider"; versionCode 1; versionName "1.0" } }';
    const first=configureReleaseGradle(source,plan);
    expect(first).toContain('versionCode 100042');expect(first).toContain('versionName "1.0.0"');
    expect(first).toContain("System.getenv('BILOO_ANDROID_STORE_PASSWORD')");
    expect(first).toContain('android.buildTypes.release.debuggable = false');
    expect(configureReleaseGradle(first,plan)).toBe(first);
    expect(()=>configureReleaseGradle(source,releasePlan('driver',42))).toThrow();
    const root=configureRootGradle('buildscript { }');
    expect(root).toContain("project.android.buildToolsVersion = '36.0.0'");
    expect(configureRootGradle(root)).toBe(root);
  });
  it('hardens each permission independently and keeps preparation idempotent',()=>{
    const original='<manifest><uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/><application android:allowBackup="true" android:usesCleartextTraffic="true"></application></manifest>';
    const first=hardenManifest(original);
    for(const name of ['ACCESS_FINE_LOCATION','ACCESS_COARSE_LOCATION','CAMERA','POST_NOTIFICATIONS']) expect(first.match(new RegExp('android.permission.'+name+'"','g'))).toHaveLength(1);
    expect(first).toContain('android:usesCleartextTraffic="false"');expect(first).toContain('android:allowBackup="false"');
    expect(first).toContain('android:name="android.hardware.camera" android:required="false"');
    expect(first.indexOf('<uses-permission')).toBeLessThan(first.indexOf('<application'));
    expect(hardenManifest(first)).toBe(first);
  });
});

describe('Generated Android integration',()=>{
  it.each(['rider','driver'])('generates valid %s MainActivity and keeps all native plugins on repeated setup',role=>{
    const dir=mkdtempSync(join(tmpdir(),'biloo-native-generation-'));temporary.push(dir);
    const folder=join(dir,`android/app/src/main/java/com/nexride/${role}`);
    mkdirSync(folder,{recursive:true});mkdirSync(join(dir,'android/app'),{recursive:true});
    cpSync('native',join(dir,'native'),{recursive:true});
    writeFileSync(join(folder,'MainActivity.java'),`package com.nexride.${role};\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}`);
    writeFileSync(join(dir,'android/app/build.gradle'),'android { }');
    writeFileSync(join(dir,'android/app/src/main/AndroidManifest.xml'),'<manifest><application android:allowBackup="true"></application></manifest>');
    for(let attempt=0;attempt<2;attempt++){
      execFileSync(process.execPath,[resolve('scripts/setup-android-reliability.mjs'),role],{cwd:dir});
      execFileSync(process.execPath,[resolve('scripts/setup-android-app-lock.mjs'),role],{cwd:dir});
    }
    const source=readFileSync(join(folder,'MainActivity.java'),'utf8');
    expect(source).not.toContain('\\n');
    for(const name of ['NexRideLiveTripPlugin','NexRideAppLockPlugin',...(role==='driver'?['NexRideDriverLocationPlugin']:[])]) expect(source.match(new RegExp(`registerPlugin\\(${name}\\.class\\)`,'g'))).toHaveLength(1);
    expect(source.match(/BilooSystemBars.apply\(this\)/g)).toHaveLength(1);
    if(role==='driver')expect(readFileSync(join(folder,'NexRideDriverLocationService.java'),'utf8')).not.toContain('\\n');
  });
  it('does not pass credentials to untrusted pull requests or upload the generated project',()=>{
    const workflow=readFileSync('.github/workflows/android-apks.yml','utf8');
    const verify=workflow.slice(workflow.indexOf('  verify:'),workflow.indexOf('  signed_release:'));
    expect(verify).not.toContain('secrets.');expect(workflow).not.toContain('pull_request_target');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).not.toContain('path: android/');
    const actions=[...workflow.matchAll(/uses: (\S+)/g)].map(match=>match[1]);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every(action=>/^actions\/[^@]+@[0-9a-f]{40}$/.test(action))).toBe(true);
  });
});

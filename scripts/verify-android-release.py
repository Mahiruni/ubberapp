#!/usr/bin/env python3
"""Verify compiled APK identity/version/configuration and, for a release, its certificate."""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


def run(command):
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError('Android verification tool failed: ' + Path(command[0]).name)
    return result.stdout


def verify(apk, plan, tools, signed=False, expected_certificate='', require_firebase=False):
    apk = Path(apk)
    if not apk.is_file() or apk.stat().st_size < 10000:
        raise ValueError('The compiled APK is missing or empty.')
    badging = run([str(tools / 'aapt'), 'dump', 'badging', str(apk)])
    match = re.search(r"package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'", badging)
    if not match or match.groups() != (plan['applicationId'], str(plan['versionCode']), plan['versionName']):
        raise ValueError('Compiled APK identity/version does not match the release plan.')
    if 'application-debuggable' in badging or 'testOnly' in badging:
        raise ValueError('A debuggable/test-only APK cannot be marked as a release.')
    manifest = run([str(tools / 'aapt'), 'dump', 'xmltree', str(apk), 'AndroidManifest.xml'])
    for name in ['debuggable', 'usesCleartextTraffic', 'allowBackup']:
        if re.search(r'android:' + name + r'[^\n]*=\(type 0x12\)0xffffffff', manifest):
            raise ValueError('Unsafe compiled Android manifest setting: ' + name)
    with zipfile.ZipFile(apk) as archive:
        config = json.loads(archive.read('assets/capacitor.config.json'))
    if config.get('appId') != plan['applicationId'] or config.get('server', {}).get('url') != 'https://ubberapp.vercel.app' + plan['startPath']:
        raise ValueError('Compiled Capacitor application/role does not match the release plan.')
    if config.get('server', {}).get('cleartext') is not False or config.get('android', {}).get('allowMixedContent') is not False:
        raise ValueError('Compiled app allows insecure mixed content.')
    if config.get('android', {}).get('webContentsDebuggingEnabled') is not False:
        raise ValueError('Release WebView debugging must be disabled.')
    if require_firebase:
        resources = run([str(tools / 'aapt'), 'dump', 'resources', str(apk)])
        if not all(name in resources for name in ['google_app_id', 'gcm_defaultSenderId']):
            raise ValueError('Role-specific Firebase resources are missing from the APK.')
    certificate = None
    if signed:
        expected = re.sub(r'[:\s]', '', expected_certificate).lower()
        if not re.fullmatch('[a-f0-9]{64}', expected):
            raise ValueError('Expected release certificate SHA-256 is required.')
        signing = run([str(tools / 'apksigner'), 'verify', '--verbose', '--print-certs', str(apk)])
        actual = re.search(r'Signer #1 certificate SHA-256 digest: ([0-9a-fA-F]+)', signing)
        if not actual or actual.group(1).lower() != expected or 'CN=Android Debug' in signing:
            raise ValueError('APK signing identity does not match the release certificate.')
        if not re.search(r'Verified using v[23] scheme[^\n]*true', signing):
            raise ValueError('The APK must verify with the Android v2 or v3 signing scheme.')
        certificate = actual.group(1).lower()
    return {**plan, 'signed': signed, 'verified': True, 'installableRelease': signed and require_firebase,
        'certificateSha256': certificate, 'apkSha256': hashlib.sha256(apk.read_bytes()).hexdigest(), 'bytes': apk.stat().st_size}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apk', required=True)
    parser.add_argument('--plan', default='android/biloo-build.json')
    parser.add_argument('--out', required=True)
    parser.add_argument('--signed', action='store_true')
    parser.add_argument('--firebase', action='store_true')
    args = parser.parse_args()
    try:
        sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
        if not sdk:
            raise ValueError('ANDROID_HOME must point to the installed Android SDK.')
        plan = json.loads(Path(args.plan).read_text())
        tools = Path(sdk) / 'build-tools' / '36.0.0'
        metadata = verify(args.apk, plan, tools, args.signed, os.environ.get('BILOO_ANDROID_CERT_SHA256', ''), args.firebase)
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        name = f"Biloo-{plan['role']}-{plan['versionName']}-{plan['versionCode']}{'-release' if metadata['installableRelease'] else '-UNSIGNED-VERIFICATION'}.apk"
        shutil.copyfile(args.apk, out / name)
        (out / (name + '.sha256')).write_text(metadata['apkSha256'] + '  ' + name + '\n')
        (out / 'release-manifest.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print('Verified Android package: ' + name)
    except (ValueError, OSError, KeyError, zipfile.BadZipFile) as error:
        print('::error title=Biloo Android verification::' + str(error), file=sys.stderr)
        sys.exit(1)

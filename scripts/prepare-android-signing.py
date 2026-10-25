#!/usr/bin/env python3
"""Install an existing release keystore into a private temporary directory.

Only public certificate metadata leaves this process. Never create replacement
production keys automatically: Android updates must retain their signing identity.
"""
import base64
import hashlib
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def prepare(env):
    required = ['BILOO_KEYSTORE_BASE64', 'BILOO_ANDROID_STORE_PASSWORD', 'BILOO_ANDROID_KEY_ALIAS',
                'BILOO_ANDROID_KEY_PASSWORD', 'BILOO_ANDROID_CERT_SHA256', 'GITHUB_ENV', 'RUNNER_TEMP']
    missing = [name for name in required if not env.get(name)]
    if missing:
        raise ValueError('Release signing is not configured. Missing: ' + ', '.join(missing) + '. See docs/biloo-android-releases.md.')
    expected = re.sub(r'[:\s]', '', env['BILOO_ANDROID_CERT_SHA256']).lower()
    if not re.fullmatch('[a-f0-9]{64}', expected):
        raise ValueError('The expected release certificate SHA-256 must contain 64 hexadecimal characters.')
    try:
        data = base64.b64decode(re.sub(r'\s', '', env['BILOO_KEYSTORE_BASE64']), validate=True)
    except ValueError:
        raise ValueError('The release keystore must be valid Base64.') from None
    if not 512 <= len(data) <= 1024 * 1024:
        raise ValueError('The release keystore size is invalid.')
    directory = Path(tempfile.mkdtemp(prefix='biloo-signing-', dir=env['RUNNER_TEMP']))
    directory.chmod(0o700)
    keyfile = directory / 'release.keystore'
    try:
        keyfile.write_bytes(data)
        keyfile.chmod(0o600)
        result = subprocess.run(['keytool', '-exportcert', '-keystore', str(keyfile), '-alias', env['BILOO_ANDROID_KEY_ALIAS'],
            '-storepass:env', 'BILOO_ANDROID_STORE_PASSWORD'], env=env, capture_output=True, check=False)
        if result.returncode or not result.stdout:
            raise ValueError('The release keystore could not be opened with the configured alias/password.')
        fingerprint = hashlib.sha256(result.stdout).hexdigest()
        if fingerprint != expected:
            raise ValueError('Release certificate mismatch. The existing signing identity was not replaced.')
        with Path(env['GITHUB_ENV']).open('a') as stream:
            stream.write('BILOO_ANDROID_KEYSTORE_FILE=' + str(keyfile) + '\n')
        return fingerprint
    except Exception:
        keyfile.unlink(missing_ok=True)
        directory.rmdir()
        raise


if __name__ == '__main__':
    try:
        fingerprint = prepare(dict(os.environ))
        print('Existing Android release certificate verified: ' + fingerprint)
    except (ValueError, OSError) as error:
        print('::error title=Biloo Android signing::' + str(error), file=sys.stderr)
        sys.exit(1)

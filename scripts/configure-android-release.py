#!/usr/bin/env python3
"""Validate an existing keystore locally; optionally configure Biloo's Actions secrets."""
import argparse
import base64
import getpass
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPOSITORY = 'github.com/Mahiruni/ubberapp'


def fingerprint(value):
    if not isinstance(value, str):
        raise ValueError('Expected a SHA-256 signing certificate fingerprint.')
    normalized = re.sub(r'[:\s]', '', value).lower()
    if not re.fullmatch('[a-f0-9]{64}', normalized):
        raise ValueError('Expected a SHA-256 signing certificate fingerprint (64 hexadecimal characters).')
    return normalized


def inspect_keystore(path, role, alias, store_password, key_password):
    if role not in ('rider', 'driver'):
        raise ValueError('Expected rider or driver.')
    if not alias or not store_password or not key_password:
        raise ValueError('The alias and both passwords are required.')
    path = Path(path).expanduser().resolve()
    if not path.is_file() or not 512 <= path.stat().st_size <= 36 * 1024:
        raise ValueError('Keystore is missing/invalid or exceeds the GitHub Actions secret size limit.')
    data = path.read_bytes()
    encoded = base64.b64encode(data).decode('ascii')
    if len(data) < 512 or len(encoded) > 48 * 1024:
        raise ValueError('Keystore is empty/invalid or exceeds the GitHub Actions secret size limit.')
    env = dict(os.environ, BILOO_SETUP_STORE_PASSWORD=store_password, BILOO_SETUP_KEY_PASSWORD=key_password)
    common = ['-keystore', str(path), '-alias', alias, '-storepass:env', 'BILOO_SETUP_STORE_PASSWORD']
    # A certificate export alone cannot establish access to the private key.
    request = subprocess.run(['keytool', '-certreq', *common, '-keypass:env', 'BILOO_SETUP_KEY_PASSWORD'],
                             env=env, capture_output=True, check=False)
    if request.returncode:
        raise ValueError('Cannot use the private signing key. Check the keystore, alias and both passwords.')
    certificate = subprocess.run(['keytool', '-exportcert', *common], env=env, capture_output=True, check=False)
    if certificate.returncode or not certificate.stdout:
        raise ValueError('Cannot read the signing certificate.')
    listing = subprocess.run(['keytool', '-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v', *common],
                             env=env, capture_output=True, check=False)
    if listing.returncode:
        raise ValueError('Cannot inspect the signing certificate.')
    if re.search(rb'CN\s*=\s*Android Debug\b', listing.stdout, re.IGNORECASE):
        raise ValueError('An Android debug certificate cannot be configured as the production release identity.')
    prefix = 'BILOO_' + role.upper() + '_'
    return hashlib.sha256(certificate.stdout).hexdigest(), {
        prefix + 'KEYSTORE_BASE64': encoded,
        prefix + 'STORE_PASSWORD': store_password,
        prefix + 'KEY_ALIAS': alias,
        prefix + 'KEY_PASSWORD': key_password,
    }


def github(arguments, value=None):
    env = dict(os.environ)
    env.pop('GH_DEBUG', None)
    env['GH_PROMPT_DISABLED'] = '1'
    result = subprocess.run(['gh', *arguments, '--repo', REPOSITORY], input=value,
                            text=True, capture_output=True, env=env, check=False)
    if result.returncode:
        # Never echo subprocess input, stderr, or a credential-bearing exception.
        raise ValueError('GitHub configuration failed. Check gh authentication and repository Actions permissions. '
                         'If a write failed, settings may be partially configured; rerun with the same certificate.')
    return result.stdout


def configure(role, certificate, values, expected):
    certificate = fingerprint(certificate)
    if certificate != fingerprint(expected):
        raise ValueError('The keystore does not match the expected release certificate. No settings were written.')
    prefix = 'BILOO_' + role.upper() + '_'
    required = {prefix + name for name in ['KEYSTORE_BASE64', 'STORE_PASSWORD', 'KEY_ALIAS', 'KEY_PASSWORD']}
    if role not in ('rider', 'driver') or set(values) != required or any(not values[name] for name in required):
        raise ValueError('Signing settings do not match the selected role.')
    variable = prefix + 'CERT_SHA256'
    existing = json.loads(github(['variable', 'list', '--json', 'name,value']))
    if not isinstance(existing, list):
        raise ValueError('GitHub returned an invalid variable list. No settings were written.')
    for item in existing:
        if not isinstance(item, dict):
            raise ValueError('GitHub returned an invalid variable list. No settings were written.')
        if item.get('name') == variable and fingerprint(item.get('value', '')) != certificate:
            raise ValueError('The repository already pins a different release certificate. No settings were written.')
    # Pin identity first. Publish the keystore last; retries keep the same identity.
    github(['variable', 'set', variable], certificate)
    for name in sorted(required - {prefix + 'KEYSTORE_BASE64'}):
        github(['secret', 'set', name, '--app', 'actions'], values[name])
    github(['secret', 'set', prefix + 'KEYSTORE_BASE64', '--app', 'actions'], values[prefix + 'KEYSTORE_BASE64'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--role', choices=['rider', 'driver'], required=True)
    parser.add_argument('--keystore', required=True, help='Path to the existing release keystore on this computer')
    parser.add_argument('--alias', required=True, help='Existing private key alias')
    parser.add_argument('--expected-cert', help='SHA-256 of the established signing certificate; required with --apply')
    parser.add_argument('--apply', action='store_true', help='Write the verified settings to Mahiruni/ubberapp via gh')
    args = parser.parse_args(argv)
    if args.apply and not args.expected_cert:
        parser.error('--apply requires --expected-cert; compare it with the established release identity first')
    if args.expected_cert:
        fingerprint(args.expected_cert)
    for tool in ['keytool'] + (['gh'] if args.apply else []):
        if not shutil.which(tool):
            raise ValueError('Required tool is unavailable: ' + tool + '. See docs/biloo-android-releases.md.')
    if not sys.stdin.isatty():
        raise ValueError('Run from an interactive terminal so password entry stays hidden.')
    store_password = getpass.getpass('Existing keystore password: ')
    key_password = getpass.getpass('Existing key password (Enter to use the keystore password): ') or store_password
    certificate, values = inspect_keystore(args.keystore, args.role, args.alias, store_password, key_password)
    if args.expected_cert and certificate != fingerprint(args.expected_cert):
        raise ValueError('The keystore does not match the expected release certificate. No settings were written.')
    print('Repository: ' + REPOSITORY)
    print('Role: ' + args.role)
    print('Signing certificate SHA-256: ' + certificate)
    print('Signing secret names: ' + ', '.join(sorted(values)))
    if not args.apply:
        print('Local verification only; no GitHub settings changed. Use --apply --expected-cert after checking identity.')
        return
    configure(args.role, certificate, values, args.expected_cert)
    print('Signing settings configured for ' + args.role + '. Configure the other role before running a signed release.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError, KeyboardInterrupt):
        error = sys.exc_info()[1]
        # Filesystem errors may include local paths; never include input passwords.
        print('Biloo Android setup: ' + (str(error) if isinstance(error, ValueError) else 'Setup could not complete; no key was generated.'), file=sys.stderr)
        sys.exit(1)

#!/usr/bin/env python3
"""Create and back up Biloo's first Rider/Driver signing keys on the owner's computer."""
import argparse
import getpass
import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('biloo_signing_setup', SCRIPTS / 'configure-android-release.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
ROLES = ('rider', 'driver')
MANIFEST = 'release-identities.json'


def directories(output, backup):
    output, backup = (Path(path).expanduser().resolve() for path in (output, backup))
    if output.is_relative_to(backup) or backup.is_relative_to(output):
        raise ValueError('Choose separate, non-nested key and backup directories.')
    for path in (output, backup):
        if any((parent / '.git').exists() for parent in (path, *path.parents)):
            raise ValueError('Signing keys and their backup must be outside every Git checkout.')
    return output, backup


def read_identities(folder):
    path = folder / MANIFEST
    if not path.exists():
        return {}
    if path.is_symlink():
        raise ValueError('The identity record must be a regular file.')
    try:
        value = json.loads(path.read_text())
        if value['schemaVersion'] != 1 or not isinstance(value['roles'], dict):
            raise ValueError()
        for role, record in value['roles'].items():
            if role not in ROLES or record['alias'] != 'biloo-' + role + '-release':
                raise ValueError()
            setup.fingerprint(record['certificateSha256'])
            setup.fingerprint(record['keystoreSha256'])
        return value['roles']
    except (ValueError, KeyError, TypeError):
        raise ValueError('The saved identity record is invalid. Restore its backup before continuing.') from None


def save_identities(folder, records):
    with tempfile.NamedTemporaryFile(mode='w', prefix='biloo-identities-', dir=folder, delete=False) as stream:
        temporary = Path(stream.name)
        try:
            stream.write(json.dumps({'schemaVersion': 1, 'roles': records}, indent=2) + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, folder / MANIFEST)
    finally:
        temporary.unlink(missing_ok=True)


def copy_key(source, destination):
    # Exclusive creation prevents replacing a key, including after a failed run.
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(source.read_bytes())
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


def generate(path, role, password):
    env = dict(os.environ, BILOO_NEW_KEY_PASSWORD=password)
    result = subprocess.run(['keytool', '-genkeypair', '-alias', 'biloo-' + role + '-release',
        '-keyalg', 'RSA', '-keysize', '3072', '-sigalg', 'SHA256withRSA', '-validity', '10000',
        '-storetype', 'PKCS12', '-dname', 'CN=Biloo ' + role.title() + ', O=Biloo', '-keystore', str(path),
        '-storepass:env', 'BILOO_NEW_KEY_PASSWORD', '-keypass:env', 'BILOO_NEW_KEY_PASSWORD'],
        env=env, capture_output=True, check=False)
    if result.returncode:
        raise ValueError('Key generation failed for ' + role + '. Existing keys were not replaced.')
    path.chmod(0o600)


def create_keys(output, backup, passwords):
    output, backup = directories(output, backup)
    if set(passwords) != set(ROLES) or any(len(passwords[role]) < 16 for role in ROLES):
        raise ValueError('Choose a password of at least 16 characters for each app.')
    records = read_identities(output)
    for role, record in read_identities(backup).items():
        if role in records and records[role] != record:
            raise ValueError('The key and backup identity records disagree. No keys were generated.')
        records[role] = record
    for folder in (output, backup):
        folder.mkdir(parents=True, exist_ok=True, mode=0o700)
        folder.chmod(0o700)
    for role in ROLES:
        alias = 'biloo-' + role + '-release'
        name = 'biloo-' + role + '-release.p12'
        key, copy = output / name, backup / name
        if key.is_symlink() or copy.is_symlink():
            raise ValueError('A signing key path is a symbolic link. No key was replaced.')
        if not key.exists() and not copy.exists():
            if role in records:
                raise ValueError('The ' + role + ' identity is already recorded but both key files are missing. Restore an existing backup.')
            with tempfile.TemporaryDirectory(prefix='biloo-new-key-', dir=output) as temporary:
                generated = Path(temporary) / name
                generate(generated, role, passwords[role])
                # Verify private-key access before preserving the generated file.
                setup.inspect_keystore(generated, role, alias, passwords[role], passwords[role])
                copy_key(generated, key)
        source = key if key.exists() else copy
        certificate, _ = setup.inspect_keystore(source, role, alias, passwords[role], passwords[role])
        record = {'applicationId': 'com.nexride.' + role, 'file': name, 'alias': alias,
                  'certificateSha256': certificate, 'keystoreSha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        if role in records and record != records[role]:
            raise ValueError('The ' + role + ' key does not match its saved identity. No key was replaced.')
        if key.exists() and copy.exists() and key.read_bytes() != copy.read_bytes():
            raise ValueError('The ' + role + ' backup differs from the original. No backup was overwritten.')
        if not key.exists():
            copy_key(copy, key)
        records[role] = record
        save_identities(output, records)
        if not copy.exists():
            copy_key(key, copy)
        key.chmod(0o600)
        copy.chmod(0o600)
        if hashlib.sha256(copy.read_bytes()).hexdigest() != record['keystoreSha256']:
            raise ValueError('The ' + role + ' backup failed verification.')
        save_identities(backup, records)
    if records['rider']['certificateSha256'] == records['driver']['certificateSha256']:
        raise ValueError('Rider and Driver must have separate first-release identities.')
    return records


def configure_and_start(output, records, passwords, start=False):
    for role in ROLES:
        record = records[role]
        certificate, values = setup.inspect_keystore(output / record['file'], role, record['alias'], passwords[role], passwords[role])
        setup.configure(role, certificate, values, record['certificateSha256'])
    if start:
        names = json.loads(setup.github(['secret', 'list', '--app', 'actions', '--json', 'name']))
        available = {item['name'] for item in names}
        missing = {'NEXRIDE_' + role.upper() + '_GOOGLE_SERVICES_BASE64' for role in ROLES} - available
        if missing:
            raise ValueError('Signing keys are configured, but Firebase settings are missing: ' + ', '.join(sorted(missing)) + '. No release build was started.')
        setup.github(['workflow', 'run', 'android-apks.yml', '--ref', 'main', '-f', 'signed_release=true'])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True, help='Private key directory outside Git')
    parser.add_argument('--backup-dir', required=True, help='Separate private backup directory, preferably on an encrypted external drive')
    parser.add_argument('--configure', action='store_true', help='Configure both apps in github.com/Mahiruni/ubberapp')
    parser.add_argument('--start-release', action='store_true', help='Start the signed APK workflow on main after configuration')
    args = parser.parse_args(argv)
    if args.start_release and not args.configure:
        parser.error('--start-release requires --configure')
    output, backup = directories(args.output_dir, args.backup_dir)
    for tool in ['keytool'] + (['gh'] if args.configure else []):
        if not shutil.which(tool):
            raise ValueError('Required tool is unavailable: ' + tool + '. See docs/biloo-android-releases.md.')
    if not sys.stdin.isatty():
        raise ValueError('Run in an interactive terminal so password entry stays hidden.')
    passwords = {}
    for role in ROLES:
        password = getpass.getpass(role.title() + ' keystore password (at least 16 characters): ')
        if len(password) < 16 or password != getpass.getpass('Confirm ' + role + ' password: '):
            raise ValueError('Passwords must match and contain at least 16 characters.')
        passwords[role] = password
    records = create_keys(output, backup, passwords)
    print('Keys and verified backup are saved. Keep both passwords in your password manager.')
    for role in ROLES:
        print(role.title() + ' signing certificate SHA-256: ' + records[role]['certificateSha256'])
    if args.configure:
        configure_and_start(output, records, passwords, args.start_release)
        print('Rider and Driver signing settings configured.')
        if args.start_release:
            print('Signed APK build requested. Track it at https://github.com/Mahiruni/ubberapp/actions')
    else:
        print('Local setup only. Rerun with the same directories/passwords and --configure to upload signing settings.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, EOFError, KeyboardInterrupt) as error:
        message = str(error) if isinstance(error, ValueError) else 'Setup could not complete. Existing key files were preserved; rerun with the same directories/passwords.'
        print('Biloo first-release setup: ' + message, file=sys.stderr)
        sys.exit(1)

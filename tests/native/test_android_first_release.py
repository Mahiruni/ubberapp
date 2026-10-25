import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import ssl
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('biloo_first_release', ROOT / 'scripts/create-android-release-keys.py')
first = importlib.util.module_from_spec(spec)
spec.loader.exec_module(first)
PASSWORDS = {'rider': 'rider-test-password-only', 'driver': 'driver-test-password-only'}


class FirstKeyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory(prefix='biloo-first-keys-test-')
        cls.output, cls.backup = Path(cls.fixture.name) / 'keys', Path(cls.fixture.name) / 'backup'
        cls.records = first.create_keys(cls.output, cls.backup, PASSWORDS)

    @classmethod
    def tearDownClass(cls):
        cls.fixture.cleanup()

    def workspace(self):
        temporary = tempfile.TemporaryDirectory(prefix='biloo-first-keys-case-')
        self.addCleanup(temporary.cleanup)
        output, backup = Path(temporary.name) / 'keys', Path(temporary.name) / 'backup'
        shutil.copytree(self.output, output)
        shutil.copytree(self.backup, backup)
        return output, backup

    def test_real_separate_keys_have_verified_backups_and_public_only_identity_records(self):
        self.assertNotEqual(self.records['rider']['certificateSha256'], self.records['driver']['certificateSha256'])
        text = (self.output / first.MANIFEST).read_text()
        for password in PASSWORDS.values():
            self.assertNotIn(password, text)
        for role, record in self.records.items():
            key, backup = self.output / record['file'], self.backup / record['file']
            self.assertEqual(key.read_bytes(), backup.read_bytes())
            self.assertEqual(hashlib.sha256(key.read_bytes()).hexdigest(), record['keystoreSha256'])
            if os.name == 'posix':
                self.assertEqual(key.stat().st_mode & 0o777, 0o600)
                self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
            certificate, _ = first.setup.inspect_keystore(key, role, record['alias'], PASSWORDS[role], PASSWORDS[role])
            self.assertEqual(certificate, record['certificateSha256'])

    def test_generated_certificate_has_long_validity_and_expected_rsa_strength(self):
        record = self.records['rider']
        env = dict(os.environ, TEST_PASSWORD=PASSWORDS['rider'])
        command = ['keytool', '-keystore', str(self.output / record['file']), '-alias', record['alias'], '-storepass:env', 'TEST_PASSWORD']
        listing = subprocess.run([command[0], '-J-Duser.language=en', '-J-Duser.country=US', '-list', '-v', *command[1:]],
                                 env=env, capture_output=True, text=True, check=True).stdout
        self.assertIn('3072-bit RSA key', listing)
        pem = subprocess.run([command[0], '-exportcert', '-rfc', *command[1:]], env=env, capture_output=True, check=True).stdout
        with tempfile.NamedTemporaryFile(suffix='.pem') as public:
            public.write(pem)
            public.flush()
            cert = ssl._ssl._test_decode_cert(public.name)
        duration = ssl.cert_time_to_seconds(cert['notAfter']) - ssl.cert_time_to_seconds(cert['notBefore'])
        self.assertGreaterEqual(duration, 25 * 365 * 24 * 3600)

    def test_repeated_setup_preserves_both_identities_without_regenerating(self):
        output, backup = self.workspace()
        with patch.object(first, 'generate') as generate:
            self.assertEqual(first.create_keys(output, backup, PASSWORDS), self.records)
        generate.assert_not_called()

    def test_missing_original_is_restored_from_verified_backup(self):
        output, backup = self.workspace()
        key = output / self.records['rider']['file']
        key.unlink()
        with patch.object(first, 'generate') as generate:
            self.assertEqual(first.create_keys(output, backup, PASSWORDS), self.records)
        generate.assert_not_called()
        self.assertEqual(key.read_bytes(), (backup / key.name).read_bytes())

    def test_recorded_identity_is_never_replaced_when_both_key_copies_are_lost(self):
        output, backup = self.workspace()
        for folder in (output, backup):
            (folder / self.records['rider']['file']).unlink()
        with patch.object(first, 'generate') as generate:
            with self.assertRaisesRegex(ValueError, 'both key files are missing'):
                first.create_keys(output, backup, PASSWORDS)
        generate.assert_not_called()

    def test_different_backup_is_preserved_and_rejected(self):
        output, backup = self.workspace()
        target = backup / self.records['rider']['file']
        target.write_bytes(b'preexisting-backup-content')
        with self.assertRaisesRegex(ValueError, 'backup differs'):
            first.create_keys(output, backup, PASSWORDS)
        self.assertEqual(target.read_bytes(), b'preexisting-backup-content')

    def test_wrong_password_never_regenerates_or_replaces_keys(self):
        output, backup = self.workspace()
        before = (output / self.records['rider']['file']).read_bytes()
        with patch.object(first, 'generate') as generate:
            with self.assertRaisesRegex(ValueError, 'private signing key'):
                first.create_keys(output, backup, {**PASSWORDS, 'rider': 'wrong-password-long-enough'})
        generate.assert_not_called()
        self.assertEqual((output / self.records['rider']['file']).read_bytes(), before)

    def test_git_checkout_and_nested_backup_paths_are_rejected_before_generation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / '.git').mkdir()
            with self.assertRaisesRegex(ValueError, 'outside every Git checkout'):
                first.directories(root / 'keys', root.parent / 'backup')
        with self.assertRaisesRegex(ValueError, 'separate, non-nested'):
            first.directories(self.output, self.output / 'backup')

    def test_conflicting_identity_records_prevent_generation(self):
        output, backup = self.workspace()
        value = json.loads((backup / first.MANIFEST).read_text())
        value['roles']['rider']['certificateSha256'] = 'b' * 64
        (backup / first.MANIFEST).write_text(json.dumps(value))
        with patch.object(first, 'generate') as generate:
            with self.assertRaisesRegex(ValueError, 'records disagree'):
                first.create_keys(output, backup, PASSWORDS)
        generate.assert_not_called()

    def test_default_cli_uses_local_only_mode_and_prints_no_passwords(self):
        output, backup = self.workspace()
        display = io.StringIO()
        with patch.object(first.shutil, 'which', return_value='/tool'), patch.object(first.sys.stdin, 'isatty', return_value=True), \
                patch.object(first.getpass, 'getpass', side_effect=[PASSWORDS['rider'], PASSWORDS['rider'], PASSWORDS['driver'], PASSWORDS['driver']]), \
                patch.object(first, 'configure_and_start') as configure, contextlib.redirect_stdout(display):
            first.main(['--output-dir', str(output), '--backup-dir', str(backup)])
        configure.assert_not_called()
        self.assertIn('Local setup only', display.getvalue())
        for password in PASSWORDS.values():
            self.assertNotIn(password, display.getvalue())


class StartReleaseTests(unittest.TestCase):
    def test_workflow_starts_only_after_both_configurations_and_firebase_presence_check(self):
        records = {role: {'file': role + '.p12', 'alias': role, 'certificateSha256': role + '-certificate'} for role in first.ROLES}
        events = []

        def configure(role, *args):
            events.append(role)

        def github(command):
            events.append(command[0])
            if command[0] == 'secret':
                return json.dumps([{'name': 'NEXRIDE_' + role.upper() + '_GOOGLE_SERVICES_BASE64'} for role in first.ROLES])
            self.assertEqual(command, ['workflow', 'run', 'android-apks.yml', '--ref', 'main', '-f', 'signed_release=true'])
            return ''

        with patch.object(first.setup, 'inspect_keystore', return_value=('certificate', {})), \
                patch.object(first.setup, 'configure', side_effect=configure), patch.object(first.setup, 'github', side_effect=github):
            first.configure_and_start(Path('/keys'), records, PASSWORDS, start=True)
        self.assertEqual(events, ['rider', 'driver', 'secret', 'workflow'])

    def test_missing_firebase_prevents_starting_a_release(self):
        records = {role: {'file': role + '.p12', 'alias': role, 'certificateSha256': 'a' * 64} for role in first.ROLES}
        with patch.object(first.setup, 'inspect_keystore', return_value=('a' * 64, {})), \
                patch.object(first.setup, 'configure'), patch.object(first.setup, 'github', return_value='[]') as github:
            with self.assertRaisesRegex(ValueError, 'Firebase settings are missing'):
                first.configure_and_start(Path('/keys'), records, PASSWORDS, start=True)
        self.assertEqual(github.call_count, 1)

    def test_default_configuration_never_dispatches_a_build(self):
        records = {role: {'file': role + '.p12', 'alias': role, 'certificateSha256': 'a' * 64} for role in first.ROLES}
        with patch.object(first.setup, 'inspect_keystore', return_value=('a' * 64, {})), \
                patch.object(first.setup, 'configure'), patch.object(first.setup, 'github') as github:
            first.configure_and_start(Path('/keys'), records, PASSWORDS)
        github.assert_not_called()

    def test_dispatch_requires_configuration_before_password_entry(self):
        with patch.object(first.getpass, 'getpass') as prompt, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                first.main(['--output-dir', '/keys', '--backup-dir', '/backup', '--start-release'])
        prompt.assert_not_called()

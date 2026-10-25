import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('biloo_android_setup', ROOT / 'scripts/configure-android-release.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class LocalKeyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='biloo-setup-test-')
        cls.key = Path(cls.temp.name) / 'fixture.jks'
        cls.env = dict(os.environ, STORE_PASS='store-password-only', KEY_PASS='key-password-only')
        subprocess.run(['keytool', '-genkeypair', '-alias', 'fixture', '-keyalg', 'RSA', '-keysize', '2048',
            '-validity', '2', '-storetype', 'JKS', '-dname', 'CN=Biloo Setup Test', '-keystore', str(cls.key),
            '-storepass:env', 'STORE_PASS', '-keypass:env', 'KEY_PASS'], env=cls.env, check=True, capture_output=True)
        cls.cert = subprocess.run(['keytool', '-exportcert', '-alias', 'fixture', '-keystore', str(cls.key),
            '-storepass:env', 'STORE_PASS'], env=cls.env, check=True, capture_output=True).stdout

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_checks_real_private_key_access_and_preserves_role_isolation(self):
        for role in ('rider', 'driver'):
            certificate, values = setup.inspect_keystore(self.key, role, 'fixture', 'store-password-only', 'key-password-only')
            self.assertEqual(certificate, hashlib.sha256(self.cert).hexdigest())
            self.assertTrue(all(name.startswith('BILOO_' + role.upper() + '_') for name in values))
            self.assertEqual(base64.b64decode(values['BILOO_' + role.upper() + '_KEYSTORE_BASE64']), self.key.read_bytes())

    def test_wrong_private_key_password_fails_even_with_correct_store_password(self):
        with self.assertRaisesRegex(ValueError, 'private signing key'):
            setup.inspect_keystore(self.key, 'rider', 'fixture', 'store-password-only', 'wrong-key-password')

    def test_certificate_only_keystore_cannot_be_used_for_signing(self):
        certificate = Path(self.temp.name) / 'public.cer'
        certificate.write_bytes(self.cert)
        trusted = Path(self.temp.name) / 'certificate-only.jks'
        subprocess.run(['keytool', '-importcert', '-noprompt', '-alias', 'fixture', '-file', str(certificate),
            '-keystore', str(trusted), '-storepass:env', 'STORE_PASS'], env=self.env, check=True, capture_output=True)
        with self.assertRaisesRegex(ValueError, 'private signing key'):
            setup.inspect_keystore(trusted, 'rider', 'fixture', 'store-password-only', 'store-password-only')

    def test_android_debug_identity_is_rejected(self):
        debug = Path(self.temp.name) / 'debug.jks'
        subprocess.run(['keytool', '-genkeypair', '-alias', 'fixture', '-keyalg', 'RSA', '-keysize', '2048',
            '-validity', '2', '-storetype', 'JKS', '-dname', 'CN=Android Debug,O=Android,C=US', '-keystore', str(debug),
            '-storepass:env', 'STORE_PASS', '-keypass:env', 'KEY_PASS'], env=self.env, check=True, capture_output=True)
        with self.assertRaisesRegex(ValueError, 'debug certificate'):
            setup.inspect_keystore(debug, 'rider', 'fixture', 'store-password-only', 'key-password-only')

    def test_preview_never_contacts_github_or_prints_secret_values(self):
        output = io.StringIO()
        with patch.object(setup.shutil, 'which', return_value='/tool'), patch.object(setup.sys.stdin, 'isatty', return_value=True), \
                patch.object(setup.getpass, 'getpass', side_effect=['store-password-only', 'key-password-only']), \
                patch.object(setup, 'github') as github, contextlib.redirect_stdout(output):
            setup.main(['--role', 'rider', '--keystore', str(self.key), '--alias', 'fixture'])
        github.assert_not_called()
        self.assertIn('Local verification only', output.getvalue())
        for value in ['store-password-only', 'key-password-only', base64.b64encode(self.key.read_bytes()).decode()]:
            self.assertNotIn(value, output.getvalue())


class GitHubConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.certificate = 'a' * 64
        self.values = {'BILOO_DRIVER_KEYSTORE_BASE64': 'test-keystore-only', 'BILOO_DRIVER_STORE_PASSWORD': 'test-store-password',
                       'BILOO_DRIVER_KEY_ALIAS': 'test-alias', 'BILOO_DRIVER_KEY_PASSWORD': 'test-key-password'}

    def test_uploads_only_the_selected_role_using_stdin_and_pins_identity_first(self):
        calls = []

        def execute(command, **kwargs):
            calls.append((command, kwargs))
            output = json.dumps([{'name': 'BILOO_DRIVER_CERT_SHA256', 'value': ':'.join(['AA'] * 32)}]) if 'list' in command else ''
            return subprocess.CompletedProcess(command, 0, stdout=output, stderr='')

        with patch.object(setup.subprocess, 'run', side_effect=execute), patch.dict(os.environ, {'GH_DEBUG': 'api'}):
            setup.configure('driver', self.certificate, self.values, self.certificate)
        writes = calls[1:]
        self.assertEqual(len(writes), 5)
        self.assertEqual(writes[0][0][1:4], ['variable', 'set', 'BILOO_DRIVER_CERT_SHA256'])
        self.assertIn('BILOO_DRIVER_KEYSTORE_BASE64', writes[-1][0])
        for command, kwargs in calls:
            self.assertEqual(command[-2:], ['--repo', 'github.com/Mahiruni/ubberapp'])
            self.assertNotIn('GH_DEBUG', kwargs['env'])
            self.assertFalse(any(value in command for value in self.values.values()))
        payloads = [kwargs['input'] for command, kwargs in writes if 'secret' in command]
        self.assertEqual(set(payloads), set(self.values.values()))

    def test_mismatched_expected_certificate_never_contacts_github(self):
        with patch.object(setup, 'github') as github:
            with self.assertRaisesRegex(ValueError, 'expected release certificate'):
                setup.configure('driver', self.certificate, self.values, 'b' * 64)
        github.assert_not_called()

    def test_existing_different_pinned_certificate_prevents_all_writes(self):
        with patch.object(setup, 'github', return_value=json.dumps([{'name': 'BILOO_DRIVER_CERT_SHA256', 'value': 'b' * 64}])) as github:
            with self.assertRaisesRegex(ValueError, 'already pins a different'):
                setup.configure('driver', self.certificate, self.values, self.certificate)
        self.assertEqual(github.call_count, 1)

    def test_cross_role_payload_is_rejected_before_network_access(self):
        with patch.object(setup, 'github') as github:
            with self.assertRaisesRegex(ValueError, 'selected role'):
                setup.configure('rider', self.certificate, self.values, self.certificate)
        github.assert_not_called()

    def test_cli_errors_do_not_echo_credentials_or_claim_success(self):
        failure = subprocess.CompletedProcess(['gh'], 1, stdout='', stderr='test-store-password')
        with patch.object(setup.subprocess, 'run', return_value=failure):
            with self.assertRaises(ValueError) as raised:
                setup.github(['secret', 'set', 'BILOO_DRIVER_STORE_PASSWORD'], 'test-store-password')
        self.assertNotIn('test-store-password', str(raised.exception))
        self.assertIn('partially configured', str(raised.exception))

    def test_apply_requires_independent_expected_identity_before_password_entry(self):
        with patch.object(setup.getpass, 'getpass') as prompt, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                setup.main(['--role', 'rider', '--keystore', 'key.jks', '--alias', 'release', '--apply'])
        prompt.assert_not_called()

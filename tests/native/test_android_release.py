import base64
import hashlib
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


signing = module('biloo_signing', 'prepare-android-signing.py')
verification = module('biloo_verification', 'verify-android-release.py')


class SigningTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='biloo-test-signing-')
        cls.source = Path(cls.temp.name) / 'fixture.p12'
        cls.env = dict(os.environ, BILOO_ANDROID_STORE_PASSWORD='test-password-only', BILOO_ANDROID_KEY_PASSWORD='test-password-only')
        subprocess.run(['keytool','-genkeypair','-alias','fixture','-keyalg','RSA','-keysize','2048','-validity','2',
            '-storetype','PKCS12','-dname','CN=Biloo Test Fixture','-keystore',str(cls.source),
            '-storepass:env','BILOO_ANDROID_STORE_PASSWORD'], env=cls.env, check=True, capture_output=True)
        cert = subprocess.run(['keytool','-exportcert','-alias','fixture','-keystore',str(cls.source),
            '-storepass:env','BILOO_ANDROID_STORE_PASSWORD'],env=cls.env,check=True,capture_output=True).stdout
        cls.fingerprint = hashlib.sha256(cert).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def config(self, directory):
        return dict(self.env, RUNNER_TEMP=directory, GITHUB_ENV=str(Path(directory)/'github-env'),
            BILOO_KEYSTORE_BASE64=base64.b64encode(self.source.read_bytes()).decode(),
            BILOO_ANDROID_KEY_ALIAS='fixture', BILOO_ANDROID_CERT_SHA256=self.fingerprint)

    def test_real_keystore_is_verified_without_writing_passwords(self):
        with tempfile.TemporaryDirectory() as directory:
            env=self.config(directory)
            self.assertEqual(signing.prepare(env),self.fingerprint)
            written=Path(env['GITHUB_ENV']).read_text()
            self.assertNotIn('test-password-only',written)
            key=Path(written.strip().split('=',1)[1])
            self.assertEqual(key.read_bytes(),self.source.read_bytes())
            self.assertEqual(key.stat().st_mode&0o777,0o600)

    def test_wrong_certificate_fails_and_removes_the_temporary_key(self):
        with tempfile.TemporaryDirectory() as directory:
            env=self.config(directory);env['BILOO_ANDROID_CERT_SHA256']='0'*64
            with self.assertRaisesRegex(ValueError,'certificate mismatch'):signing.prepare(env)
            self.assertEqual(list(Path(directory).iterdir()),[])

    def test_missing_signing_configuration_never_creates_a_key(self):
        with self.assertRaisesRegex(ValueError,'not configured'):signing.prepare({})


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.apk=Path(self.temp.name)/'fixture.apk'
        config={'appId':'com.nexride.rider','server':{'url':'https://ubberapp.vercel.app/rider','cleartext':False},
            'android':{'allowMixedContent':False,'webContentsDebuggingEnabled':False}}
        with zipfile.ZipFile(self.apk,'w') as z:
            z.writestr('assets/capacitor.config.json',json.dumps(config));z.writestr('padding',b'x'*12000)
        self.plan={'role':'rider','applicationId':'com.nexride.rider','versionCode':100001,'versionName':'1.0.0','name':'Biloo Rider','startPath':'/rider'}
        self.badging="package: name='com.nexride.rider' versionCode='100001' versionName='1.0.0'"
        self.signature='Signer #1 certificate SHA-256 digest: '+'a'*64+'\nVerified using v2 scheme (APK Signature Scheme v2): true'

    def output(self, command):
        if command[0].endswith('apksigner'):return self.signature
        if 'badging' in command:return self.badging
        if 'resources' in command:return 'google_app_id gcm_defaultSenderId'
        return 'android:allowBackup=(type 0x12)0x0'

    def verify(self, signed=False):
        with patch.object(verification,'run',side_effect=self.output):
            return verification.verify(self.apk,self.plan,Path('/sdk'),signed,'a'*64,True)

    def test_unsigned_build_is_never_labelled_installable(self):
        self.assertFalse(self.verify()['installableRelease'])
        self.assertTrue(self.verify(True)['installableRelease'])

    def test_wrong_package_version_or_debuggable_build_is_rejected(self):
        for badging in [self.badging.replace('com.nexride.rider','com.nexride.driver'),
                        self.badging.replace('100001','1'),self.badging+'\napplication-debuggable']:
            self.badging=badging
            with self.assertRaises(ValueError):self.verify()

    def test_wrong_signing_certificate_is_rejected(self):
        self.signature=self.signature.replace('a'*64,'b'*64)
        with self.assertRaisesRegex(ValueError,'signing identity'):self.verify(True)

    def test_legacy_v1_only_signature_cannot_become_a_release(self):
        self.signature=self.signature.replace('v2 scheme','v1 scheme')
        with self.assertRaisesRegex(ValueError,'v2 or v3'):self.verify(True)

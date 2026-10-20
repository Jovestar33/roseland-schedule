import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('backup_verifier', Path(__file__).resolve().parents[2] / 'scripts/hosting/verify-backup.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class BackupVerification(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        identity = {'organization': True, 'owner': True, 'versions': verifier.VERSIONS}
        contents = {'identity.json': json.dumps(identity).encode(), 'database.dump': b'PGDMPfictional-test-archive',
                    'roles.sql': b'-- fictional roles\n', 'archive-list.txt': '\n'.join('TABLE DATA ' + t for t in ('public organizations', 'public organization_memberships', 'auth users', 'supabase_migrations schema_migrations')).encode()}
        for name, data in contents.items():
            path = self.root / name
            path.write_bytes(data)
            path.chmod(0o600)
        self.manifest = {'project': verifier.PROJECT, 'readOnly': True, 'archiveVerified': True,
                         'files': {name: {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in contents.items()}}
        self.save_manifest()

    def save_manifest(self):
        path = self.root / 'manifest.json'
        path.write_text(json.dumps(self.manifest))
        path.chmod(0o600)

    def test_integrity_is_not_restore_proof(self):
        result = verifier.verify(self.root)
        self.assertTrue(result['checksumsVerified'])
        self.assertFalse(result['restoreTested'])

    def test_corrupt_archive_rejected(self):
        (self.root / 'database.dump').write_bytes(b'PGDMPtampered')
        with self.assertRaisesRegex(ValueError, 'checksum'):
            verifier.verify(self.root)

    def test_public_file_rejected(self):
        (self.root / 'roles.sql').chmod(0o644)
        with self.assertRaisesRegex(ValueError, 'permissions'):
            verifier.verify(self.root)

    def test_other_project_rejected(self):
        self.manifest['project'] = 'other'
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'another project'):
            verifier.verify(self.root)

    def test_manifest_path_injection_rejected(self):
        self.manifest['files']['../outside'] = {}
        self.save_manifest()
        with self.assertRaisesRegex(ValueError, 'exactly'):
            verifier.verify(self.root)

    def test_symlink_rejected(self):
        path = self.root / 'roles.sql'
        path.rename(self.root / 'roles-real.sql')
        path.symlink_to(self.root / 'roles-real.sql')
        with self.assertRaisesRegex(ValueError, 'ordinary private'):
            verifier.verify(self.root)


if __name__ == '__main__':
    unittest.main()

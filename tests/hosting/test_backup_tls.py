import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('backup_helper', Path(__file__).resolve().parents[2] / 'scripts/hosting/backup-hosted.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class BackupTLS(unittest.TestCase):
    def test_commands_require_pinned_ca_and_full_verification(self):
        command = helper.remote_command('psql', '--no-password')
        self.assertIn('PGSSLMODE=verify-full', command)
        self.assertIn('PGSSLROOTCERT=' + helper.CA_CONTAINER, command)
        self.assertIn('PGOPTIONS=-c default_transaction_read_only=on', command)
        self.assertEqual(hashlib.sha256(helper.CA_FILE.read_bytes()).hexdigest(), helper.CA_SHA256)

    def test_changed_ca_rejected_before_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / 'changed.crt'
            fake.write_text('untrusted certificate')
            with patch.object(helper, 'CA_FILE', fake), patch.object(helper.subprocess, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'missing or changed'):
                    helper.prepare_certificate()
                run.assert_not_called()


if __name__ == '__main__':
    unittest.main()

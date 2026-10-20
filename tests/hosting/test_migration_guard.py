import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('migration_helper', Path(__file__).resolve().parents[2] / 'scripts/hosting/migrate-hosted.py')
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class MigrationGuard(unittest.TestCase):
    def test_no_password_seed_or_reset_in_cli_arguments(self):
        for dry in (True, False):
            cmd = helper.cli_command(dry)
            self.assertEqual(cmd[1:3], ['db', 'push'])
            self.assertNotIn('--password', cmd)
            self.assertNotIn('--include-seed', cmd)
            self.assertNotIn('--include-roles', cmd)
            self.assertNotIn('reset', cmd)
            self.assertIn('sslmode=verify-full', cmd[4])
        self.assertIn('--dry-run', helper.cli_command(True))
        self.assertIn('--yes', helper.cli_command(False))

    def test_dry_run_requires_exact_files(self):
        plan = {'pending': [{'file': '20260101000000_one.sql'}, {'file': '20260102000000_two.sql'}]}
        helper.validate_dry_run(' • 20260101000000_one.sql\n • 20260102000000_two.sql', plan)
        for output in ('', '20260101000000_one.sql', '20260101000000_one.sql 20260102000000_two.sql 20260103000000_unreviewed.sql'):
            with self.assertRaisesRegex(RuntimeError, 'exactly'):
                helper.validate_dry_run(output, plan)


if __name__ == '__main__':
    unittest.main()

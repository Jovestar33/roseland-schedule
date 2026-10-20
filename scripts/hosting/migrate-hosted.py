#!/usr/bin/env python3
"""Apply the rehearsed forward plan only after private backup and live checks.

No password is saved or passed in argv. No seed/reset/role imports are performed.
"""
import datetime
import getpass
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[2]
PLAN = Path('/private/tmp/roseland-hosted-migration-plan-current.json')


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/hosting' / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


backup = module('hosted_backup', 'backup-hosted.py')
verifier = module('backup_verifier', 'verify-backup.py')


def validate_plan(directory):
    verifier.verify(directory)
    report = json.loads((directory / 'restore-rehearsal/migration-result.json').read_text())
    checks = json.loads((directory / 'restore-rehearsal/post-migration-checks.json').read_text())
    plan = json.loads(PLAN.read_text())
    if plan.get('appliedCount') != 5 or plan.get('pendingCount') != 51:
        raise RuntimeError('Unexpected migration plan; review again before deployment.')
    expected = [row['file'] for row in plan['pending']]
    if report.get('failedMigration') or report.get('sourceMigrationsApplied') != expected or report.get('hostedWrites') is not False:
        raise RuntimeError('The exact forward plan has not passed the isolated rehearsal.')
    if not all(checks.get(k) is True for k in ('originalOrganization', 'originalOwner', 'originalAuthUser')) or checks.get('publicTablesWithoutRls') != [] or checks.get('postgresSuperuser') is not False:
        raise RuntimeError('Restoration preservation/security checks did not pass.')
    if checks.get('accountPolicyEnforced') is not False or checks.get('dataApiSessionHook') != 'pgrst.db_pre_request=public.check_application_session':
        raise RuntimeError('Restoration account/session checks did not pass.')
    sources = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    if [p.name for p in sources[5:]] != expected or len(sources) != 56:
        raise RuntimeError('Migration source set changed after rehearsal.')
    for row in plan['pending']:
        if hashlib.sha256((ROOT / 'supabase/migrations' / row['file']).read_bytes()).hexdigest() != row['sha256']:
            raise RuntimeError('Migration source checksum changed: ' + row['file'])
    return plan


def original_table_digest_sql():
    tables = ('private.platform_operators', 'private.workflow_requests', 'public.audit_events',
              'public.organization_invitations', 'public.organization_memberships', 'public.organizations',
              'public.production_memberships', 'public.productions', 'public.profiles',
              'supabase_migrations.schema_migrations')
    parts = ["select '" + table + "' as relation, count(*) as rows, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by to_jsonb(t)::text),'')) as digest from " + table + ' t' for table in tables]
    return 'select json_agg(x order by relation) from (' + ' union all '.join(parts) + ') x;'


def cli_command(dry_run):
    url = ('postgresql://postgres.' + backup.PROJECT + '@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
           '?sslmode=verify-full&sslrootcert=' + quote(str(backup.CA_FILE), safe=''))
    command = [str(ROOT / 'node_modules/.bin/supabase'), 'db', 'push', '--db-url', url, '--workdir', str(ROOT)]
    return command + (['--dry-run'] if dry_run else ['--yes'])


def validate_dry_run(output, plan):
    found = sorted(set(re.findall(r'\b\d{14}_[A-Za-z0-9_]+\.sql\b', output)))
    if found != sorted(row['file'] for row in plan['pending']):
        raise RuntimeError('CLI dry-run did not list exactly the rehearsed migrations; no migration was applied.')


def main():
    if len(sys.argv) != 2 or not sys.stdin.isatty():
        raise RuntimeError('Run in Terminal: python3 scripts/hosting/migrate-hosted.py PRIVATE_BACKUP_DIRECTORY')
    os.umask(0o077)
    directory = Path(sys.argv[1]).resolve()
    plan = validate_plan(directory)
    backup.prepare_certificate()
    print('Roseland Pictures: apply 51 rehearsed forward migrations to roseland-schedule-dev.')
    print('Backup, restoration and source checks passed. Existing records are preserved; no fixtures will be imported.')
    password = getpass.getpass('Database password (hidden, not saved): ')
    if not password:
        raise RuntimeError('No password supplied; no changes made.')
    env = dict(os.environ, PGPASSWORD=password, SUPABASE_DB_PASSWORD=password)
    def scrub(text):
        return text.replace(password, '[redacted]').replace(quote(password, safe=''), '[redacted]')
    def query(sql):
        result = subprocess.run(backup.remote_command('psql', '--no-password', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql), env=env, capture_output=True, text=True, timeout=45)
        if result.returncode:
            raise RuntimeError('Database check failed: ' + scrub(result.stderr))
        return json.loads(result.stdout)
    try:
        identity = query(backup.IDENTITY_SQL)
        if not backup.valid_identity(identity):
            raise RuntimeError('Hosted identity/history changed; no migrations started. Do not retry blindly.')
        print('Original organization, Owner and hosted migration history confirmed.', flush=True)
        result = subprocess.run(cli_command(True), env=env, capture_output=True, text=True, timeout=180)
        output = scrub(result.stdout + result.stderr)
        (directory / 'migration-dry-run.log').write_text(output)
        if result.returncode:
            raise RuntimeError('CLI dry-run failed. No migrations applied. Details: ' + output[-2200:])
        validate_dry_run(output, plan)
        validate_plan(directory)
        original = json.loads((directory / 'restore-rehearsal/table-digests.json').read_text())
        if query(original_table_digest_sql()) != original:
            raise RuntimeError('Original hosted records changed since backup; capture a fresh recovery copy before applying migrations.')
        print('CLI dry-run matches all 51 migrations. Applying the reviewed schema updates…', flush=True)
        result = subprocess.run(cli_command(False), env=env, capture_output=True, text=True, timeout=900)
        (directory / 'migration-apply.log').write_text(scrub(result.stdout + result.stderr))
        if result.returncode:
            raise RuntimeError('Migration run stopped. Some migrations may have committed; do not reset or rerun. Private migration-apply.log is available for review.')
        after = query(backup.IDENTITY_SQL)
        expected = backup.EXPECTED_VERSIONS + [row['version'] for row in plan['pending']]
        if after.get('organization') is not True or after.get('owner') is not True or after.get('versions') != expected:
            raise RuntimeError('Post-migration verification failed; stop and inspect. Do not reset the database.')
        (directory / 'hosted-migration-result.json').write_text(json.dumps({'project': backup.PROJECT, 'verified': True, 'originalOrganizationAndOwnerPreserved': True, 'versions': expected, 'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}, indent=2) + '\n')
        print('Hosted migrations complete; all 56 versions and the original organization/Owner verified.')
        print('No test data imported. Trial deployment, mail, schedule import and sync still require verification.')
    except subprocess.TimeoutExpired:
        raise RuntimeError('Operation timed out. Its outcome must be inspected before retrying; do not reset the database.') from None
    finally:
        env.pop('PGPASSWORD', None)
        env.pop('SUPABASE_DB_PASSWORD', None)
        password = None


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('Stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)

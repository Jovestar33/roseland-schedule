#!/usr/bin/env python3
"""Private, read-only backup of the existing Roseland hosted database.

Run in a real terminal. The password is prompted without echo and is passed to
Docker exec through its environment, never command arguments or an output file.
No database migrations, password changes, or restores are performed.
"""
import datetime
import getpass
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

PROJECT = 'dapvzbzyozlthmhjlekj'
CONTAINER = 'supabase_db_roseland-b14-destination-g2'
CA_FILE = Path(__file__).with_name('supabase-ca.crt')
CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7'
CA_CONTAINER = '/tmp/roseland-backup-supabase-ca.crt'
ROOT = Path.home() / 'roseland-schedule/.netlify/trial-launch-recovery'
EXPECTED_VERSIONS = ['20260719052450', '20260720022921', '20260720034500', '20260720043000', '20260726090000']
IDENTITY_SQL = """select json_build_object(
 'organization', exists(select 1 from public.organizations where id='820f7fc4-e364-4aae-a29a-65f7d84eef61' and slug='roseland-pictures'),
 'owner', exists(select 1 from public.organization_memberships where organization_id='820f7fc4-e364-4aae-a29a-65f7d84eef61' and user_id='71280ab3-541c-4e7f-95f3-f646ac2d701b' and role='owner' and status='active'),
 'versions', (select json_agg(version order by version) from supabase_migrations.schema_migrations));"""


def remote_command(program, *args):
    options = {
        'PGHOST': 'aws-0-us-east-1.pooler.supabase.com',
        'PGUSER': 'postgres.' + PROJECT,
        'PGDATABASE': 'postgres', 'PGPORT': '5432',
        'PGSSLMODE': 'verify-full',
        'PGSSLROOTCERT': CA_CONTAINER,
        'PGCONNECT_TIMEOUT': '15',
        'PGOPTIONS': '-c default_transaction_read_only=on',
    }
    command = ['docker', 'exec', '-i', '--env', 'PGPASSWORD']
    for key, value in options.items():
        command += ['--env', key + '=' + value]
    return command + [CONTAINER, program, *args]


def prepare_certificate():
    # Public CA downloaded from Supabase Dashboard > Database > SSL configuration.
    # Scope trust to this backup command; never alter the container's system trust.
    if hashlib.sha256(CA_FILE.read_bytes()).hexdigest() != CA_SHA256:
        raise RuntimeError('Supabase CA certificate is missing or changed; recheck its official source.')
    result = subprocess.run(['docker', 'cp', str(CA_FILE), CONTAINER + ':' + CA_CONTAINER], capture_output=True, text=True, timeout=20)
    if result.returncode:
        raise RuntimeError('Could not prepare the backup certificate: ' + result.stderr.strip())


def valid_identity(value):
    return value.get('organization') is True and value.get('owner') is True and value.get('versions') == EXPECTED_VERSIONS


def main():
    if not sys.stdin.isatty():
        raise RuntimeError('Run this helper in a terminal so password entry is hidden.')
    os.umask(0o077)
    prepare_certificate()
    print('Roseland Pictures: read-only hosted backup')
    print('Project: roseland-schedule-dev (' + PROJECT + ')')
    print('No migration or password change will run. The password is not saved.')
    password = getpass.getpass('Existing database password (hidden): ')
    if not password:
        raise RuntimeError('No password entered; nothing was changed.')
    env = dict(os.environ, PGPASSWORD=password)
    destination = None
    try:
        result = subprocess.run(remote_command('psql', '--no-password', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', IDENTITY_SQL), env=env, capture_output=True, text=True, timeout=40)
        if result.returncode:
            raise RuntimeError('Could not verify the connection: ' + result.stderr.replace(password, '[redacted]').strip())
        identity = json.loads(result.stdout)
        if not valid_identity(identity):
            raise RuntimeError('Project records or migration history differ from the reviewed baseline. No dump was started.')
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        destination = ROOT / ('hosted-' + stamp)
        destination.mkdir(parents=True, mode=0o700, exist_ok=False)
        (destination / 'identity.json').write_text(json.dumps(identity, indent=2) + '\n')
        print('Identity confirmed. Reading the hosted database into a private backup…', flush=True)
        archive = destination / 'database.dump'
        with archive.open('xb') as output:
            result = subprocess.run(remote_command('pg_dump', '--no-password', '--format=custom'), env=env, stdout=output, stderr=subprocess.PIPE, timeout=600)
        if result.returncode:
            raise RuntimeError('Database dump did not complete: ' + result.stderr.decode(errors='replace').replace(password, '[redacted]').strip())
        with (destination / 'roles.sql').open('x') as output:
            result = subprocess.run(remote_command('pg_dumpall', '--no-password', '--roles-only', '--no-role-passwords'), env=env, stdout=output, stderr=subprocess.PIPE, timeout=60)
        if result.returncode:
            raise RuntimeError('Role backup did not complete: ' + result.stderr.decode(errors='replace').replace(password, '[redacted]').strip())
        # Inspect the archive locally; this makes no hosted connection or writes.
        with archive.open('rb') as source:
            listing = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'pg_restore', '--list'], stdin=source, capture_output=True, timeout=60)
        contents = listing.stdout.decode(errors='replace')
        if listing.returncode or not all(item in contents for item in ['TABLE DATA public organizations', 'TABLE DATA public organization_memberships', 'TABLE DATA auth users', 'TABLE DATA supabase_migrations schema_migrations']):
            raise RuntimeError('Backup archive verification failed; do not use this as a verified recovery copy.')
        (destination / 'archive-list.txt').write_text(contents)
        files = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in destination.iterdir() if p.is_file()}
        manifest = {'project': PROJECT, 'createdAt': stamp, 'readOnly': True, 'archiveVerified': True, 'restoreTested': False, 'files': files}
        (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        print('Backup complete; archive contents and checksums verified.')
        print('Private recovery folder: ' + str(destination))
        print('No hosted database changes were made. Restore testing is still pending.')
    finally:
        env.pop('PGPASSWORD', None)
        password = None


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('Backup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)

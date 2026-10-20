#!/usr/bin/env python3
"""Verify a private hosted backup without connecting or printing database contents."""
import hashlib
import json
from pathlib import Path
import stat
import sys

PROJECT = 'dapvzbzyozlthmhjlekj'
VERSIONS = ['20260719052450', '20260720022921', '20260720034500', '20260720043000', '20260726090000']
REQUIRED = {'identity.json', 'database.dump', 'roles.sql', 'archive-list.txt'}


def private_path(path, directory=False):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or (not stat.S_ISDIR(info.st_mode) if directory else not stat.S_ISREG(info.st_mode)):
        raise ValueError('Expected an ordinary private ' + ('directory' if directory else 'file'))
    if info.st_mode & 0o077:
        raise ValueError('Backup permissions allow access by other users')


def verify(directory):
    root = Path(directory)
    private_path(root, directory=True)
    private_path(root / 'manifest.json')
    manifest = json.loads((root / 'manifest.json').read_text())
    if manifest.get('project') != PROJECT or manifest.get('readOnly') is not True or manifest.get('archiveVerified') is not True:
        raise ValueError('Backup is incomplete or belongs to another project')
    files = manifest.get('files')
    if not isinstance(files, dict) or set(files) != REQUIRED:
        raise ValueError('Backup manifest must contain exactly the expected recovery files')
    for name in sorted(REQUIRED):
        path = root / name
        private_path(path)
        expected = files[name]
        digest = hashlib.sha256()
        with path.open('rb') as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b''):
                digest.update(chunk)
        if path.stat().st_size <= 0 or path.stat().st_size != expected.get('bytes') or digest.hexdigest() != expected.get('sha256'):
            raise ValueError('Backup checksum or size mismatch: ' + name)
    with (root / 'database.dump').open('rb') as archive:
        if archive.read(5) != b'PGDMP':
            raise ValueError('Expected a PostgreSQL custom-format archive')
    identity = json.loads((root / 'identity.json').read_text())
    if identity.get('organization') is not True or identity.get('owner') is not True or identity.get('versions') != VERSIONS:
        raise ValueError('Backup identity differs from the reviewed original organization and history')
    listing = (root / 'archive-list.txt').read_text()
    for table in ('public organizations', 'public organization_memberships', 'auth users', 'supabase_migrations schema_migrations'):
        if 'TABLE DATA ' + table not in listing:
            raise ValueError('Recovery archive is missing required table data')
    return {'project': PROJECT, 'checksumsVerified': True, 'privatePermissionsVerified': True,
            'originalIdentityVerified': True, 'restoreTested': False,
            'note': 'This verifies saved backup integrity, not a restore or current hosted state.'}


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: python3 scripts/hosting/verify-backup.py PRIVATE_BACKUP_DIRECTORY')
        print(json.dumps(verify(sys.argv[1]), indent=2))
    except (ValueError, OSError, TypeError, KeyError) as error:
        print('Backup verification failed: ' + str(error), file=sys.stderr)
        sys.exit(1)

"""Credential-free fictional checkpoint/journal contract; no IO or database access."""
import copy
import hashlib
import json
import re
import uuid

TABLE_KEYS = {
    'auth.users': ('id',), 'public.profiles': ('user_id',),
    'public.organizations': ('id',), 'public.productions': ('id',),
    'public.phases': ('id',), 'public.production_days': ('id',),
    'public.schedules': ('id',), 'public.schedule_versions': ('id',),
    'public.audit_events': ('id',), 'private.migration_records': ('id',),
    'private.migration_record_versions': ('record_id', 'version'),
}
APPEND_ONLY = {'public.schedule_versions', 'public.audit_events', 'private.migration_record_versions'}
AUTH_FIELDS = {'id', 'email', 'role', 'aud', 'email_confirmed_at', 'created_at', 'updated_at'}
HEADER = {'format', 'run_id', 'organization_id', 'owner_id', 'code_commit', 'schema_sha256'}


class InvalidRecovery(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidRecovery(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def key(table, row):
    require(isinstance(row, dict), 'Invalid record')
    require(all(k in row for k in TABLE_KEYS[table]), 'Missing record identity')
    return canonical([row[k] for k in TABLE_KEYS[table]])


def index(table, rows):
    require(isinstance(rows, list), 'Invalid table records')
    result = {}
    for row in rows:
        k = key(table, row)
        require(k not in result, 'Duplicate record identity')
        result[k] = row
    return result


def validate_tables(tables, header):
    require(isinstance(tables, dict) and set(tables) == set(TABLE_KEYS), 'Incomplete or unknown table inventory')
    for table, rows in tables.items():
        index(table, rows)
        for row in rows:
            require(all(re.fullmatch(r'[a-z][a-z0-9_]*', col) for col in row), 'Invalid column name')
            if table == 'auth.users':
                require(set(row) <= AUTH_FIELDS and row['id'] == header['owner_id'], 'Authentication secrets/other identities are excluded')
                require(row.get('email') == f"recovery-{header['run_id']}@example.test", 'Only the generated fictional identity is supported')
            elif table == 'public.profiles':
                require(row['user_id'] == header['owner_id'], 'Unexpected profile')
            elif table == 'public.organizations':
                require(row['id'] == header['organization_id'], 'Unexpected organization')
            else:
                require(row.get('organization_id') == header['organization_id'], 'Cross-tenant checkpoint row')


def checkpoint(header, tables):
    require(set(header) == HEADER and header['format'] == 'fictional-recovery-v1', 'Unsupported checkpoint scope')
    for field in ['run_id', 'organization_id', 'owner_id']:
        require(str(uuid.UUID(header[field])) == header[field], 'Invalid fixture identity')
    require(bool(re.fullmatch(r'[a-f0-9]{40}', header['code_commit'])), 'Known-good code commit required')
    require(bool(re.fullmatch(r'[a-f0-9]{64}', header['schema_sha256'])), 'Schema hash required')
    validate_tables(tables, header)
    value = {**copy.deepcopy(header), 'tables': {
        table: [copy.deepcopy(row) for _, row in sorted(index(table, tables[table]).items())]
        for table in TABLE_KEYS}}
    return {**value, 'sha256': digest(value)}


def verify_checkpoint(value):
    require(isinstance(value, dict) and set(value) == HEADER | {'tables', 'sha256'}, 'Invalid checkpoint envelope')
    expected = checkpoint({k: value[k] for k in HEADER}, value['tables'])
    require(expected == value, 'Checkpoint content/hash mismatch')
    return value


def journal(before, after):
    verify_checkpoint(before); verify_checkpoint(after)
    require(all(before[k] == after[k] for k in HEADER), 'Checkpoint boundary mismatch')
    changes = []
    for table in TABLE_KEYS:
        old, new = index(table, before['tables'][table]), index(table, after['tables'][table])
        require(not (old.keys() - new.keys()), 'Hard deletion cannot silently disappear from recovery')
        for k, row in sorted(new.items()):
            previous = old.get(k)
            if previous == row:
                continue
            require(not (table in APPEND_ONLY and previous is not None), 'Immutable history changed')
            changes.append({'table': table, 'key': k, 'expected_sha256': digest(previous) if previous else None, 'row': copy.deepcopy(row)})
    value = {'format': 'fictional-journal-v1', 'run_id': before['run_id'], 'before_sha256': before['sha256'],
             'after_sha256': after['sha256'], 'changes': changes}
    return {**value, 'sha256': digest(value)}


def replay(before, delta):
    verify_checkpoint(before)
    require(isinstance(delta, dict) and set(delta) == {'format','run_id','before_sha256','after_sha256','changes','sha256'}, 'Invalid journal envelope')
    require(delta['format'] == 'fictional-journal-v1' and delta['run_id'] == before['run_id'], 'Journal scope mismatch')
    require(digest({k:v for k,v in delta.items() if k != 'sha256'}) == delta['sha256'], 'Journal hash mismatch')
    require(delta['before_sha256'] == before['sha256'], 'Wrong or stale checkpoint predecessor')
    tables = copy.deepcopy(before['tables']); seen = set()
    for change in delta['changes']:
        require(set(change) == {'table','key','expected_sha256','row'}, 'Invalid journal change')
        table = change['table']; require(table in TABLE_KEYS, 'Unknown journal table')
        k = key(table, change['row'])
        require(k == change['key'] and (table,k) not in seen, 'Duplicate or mismatched journal identity')
        seen.add((table,k)); rows = index(table, tables[table]); old = rows.get(k)
        require((digest(old) if old else None) == change['expected_sha256'], 'Journal precondition conflict')
        require(not (table in APPEND_ONLY and old is not None), 'Immutable history rewrite refused')
        rows[k] = change['row']; tables[table] = list(rows.values())
    after = checkpoint({k: before[k] for k in HEADER}, tables)
    require(after['sha256'] == delta['after_sha256'], 'Incomplete journal or final hash mismatch')
    return after


def reconcile(expected, actual_tables):
    verify_checkpoint(expected)
    details = []; missing = []; unexpected = []; mismatched = []; duplicates = []
    require(set(actual_tables) == set(TABLE_KEYS), 'Incomplete reconciliation inventory')
    for table in TABLE_KEYS:
        want = index(table, expected['tables'][table]); got = {}
        for row in actual_tables[table]:
            k = key(table, row)
            if k in got: duplicates.append({'table': table, 'key': k})
            got[k] = row
        for k in sorted(want.keys() | got.keys()):
            status = 'missing' if k not in got else 'unexpected' if k not in want else 'mismatched' if want[k] != got[k] else 'verified'
            item = {'table': table, 'key': k, 'status': status,
                    'expected_sha256': digest(want[k]) if k in want else None,
                    'actual_sha256': digest(got[k]) if k in got else None}
            details.append(item)
            if status == 'missing': missing.append(item)
            if status == 'unexpected': unexpected.append(item)
            if status == 'mismatched': mismatched.append(item)
    return {'verified': not (missing or unexpected or mismatched or duplicates), 'records': details,
            'missing': missing, 'unexpected': unexpected, 'mismatched': mismatched, 'duplicates': duplicates, 'failed': []}

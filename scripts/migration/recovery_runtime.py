"""Trusted restore primitives for generated fictional data in a disposable cluster.

Recovery databases have a random reserved name and a matching marker. They have
no connected Supabase API/Auth service. Never restore into the source database.
"""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from recovery_contract import TABLE_KEYS, AUTH_FIELDS, HEADER, checkpoint, verify_checkpoint, reconcile, require


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def encoded(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False)) + '::jsonb'


def column(name):
    require(bool(re.fullmatch(r'[a-z][a-z0-9_]*', name)), 'Invalid column')
    return '"' + name + '"'


class LocalRecovery:
    def __init__(self, workdir):
        root = Path(workdir).resolve()
        require(not (root/'supabase/.temp/project-ref').exists(), 'Linked projects refused')
        config = (root/'supabase/config.toml').read_text()
        match = re.search(r'^project_id\s*=\s*"([\w-]+)"', config, re.M)
        require(match is not None, 'Local project ID required')
        self.container = 'supabase_db_' + match.group(1)
        info = json.loads(subprocess.check_output(['docker','inspect',self.container], text=True))[0]
        require(info['Name'] == '/'+self.container and 'supabase/postgres' in info['Config']['Image'], 'Expected local database container')

    def sql(self, statement, database='postgres'):
        result = subprocess.run(['docker','exec','-i',self.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],
                                input=statement, text=True, capture_output=True, timeout=60)
        if result.returncode:
            # This runner only generates fictional data; report bounded database
            # diagnostics, not the entire SQL payload or any connection settings.
            raise RuntimeError('Local recovery SQL failed: ' + '\n'.join(result.stderr.splitlines()[:4]))
        return result.stdout.strip()

    def schema(self):
        result = subprocess.run(['docker','exec',self.container,'pg_dump','-U','postgres','-d','postgres',
                                 '--schema-only','--no-owner','--schema','public','--schema','private','--schema','auth','--schema','extensions'],
                                text=True, capture_output=True, timeout=60)
        require(result.returncode == 0, 'Local schema capture failed')
        # pg_dump -n deliberately omits extension dependencies. Install only the
        # functions used by these application schemas in the empty recovery DB.
        require('CREATE SCHEMA extensions;' in result.stdout, 'Unexpected schema layout')
        # Existing object ACLs/RLS are retained. Future-object grants belonging
        # to privileged Supabase roles cannot be restored by the local postgres
        # role and are outside this disconnected, data-recovery rehearsal.
        lines = result.stdout.splitlines(keepends=True)
        for line in lines:
            if line.startswith('ALTER DEFAULT PRIVILEGES'):
                require(line.rstrip().endswith(';'), 'Unexpected multiline default grant')
        body = ''.join(line for line in lines if not line.startswith('ALTER DEFAULT PRIVILEGES'))
        return ('drop schema public;\n' + body.replace('CREATE SCHEMA extensions;',
                'CREATE SCHEMA extensions;\nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;\nCREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;'))

    def create_database(self, run_id, schema, generation=1):
        require(type(generation) is int and 1 <= generation <= 99, 'Invalid recovery generation')
        database = 'roseland_recovery_' + run_id.replace('-','') + '_' + str(generation)
        require(bool(re.fullmatch(r'roseland_recovery_[a-f0-9]{32}_[1-9][0-9]?', database)), 'Invalid recovery database name')
        require(self.sql(f"select count(*) from pg_database where datname={literal(database)};") == '0', 'Recovery database already exists; refusing replacement')
        self.sql(f'create database {database} template template0;')
        self.sql(schema, database)
        self.sql(f"""create table private.recovery_control (
            singleton boolean primary key default true check(singleton), run_id uuid not null,
            mode text not null check(mode in ('frozen','active')), applied_hash text);
            revoke all on private.recovery_control from public,anon,authenticated,service_role;
            insert into private.recovery_control(run_id,mode) values ({literal(run_id)},'frozen');""", database)
        return database

    def guard_database(self, database, run_id):
        require(bool(re.fullmatch('roseland_recovery_' + run_id.replace('-','') + '_[1-9][0-9]?', database)), 'Only this generated recovery database is writable')
        require(self.sql('select run_id::text from private.recovery_control;', database) == run_id, 'Recovery marker mismatch')

    @staticmethod
    def projection(table, alias='r'):
        if table == 'auth.users':
            return 'jsonb_build_object(' + ','.join(literal(c)+','+alias+'.'+column(c) for c in sorted(AUTH_FIELDS)) + ')'
        return f'to_jsonb({alias})'

    def capture_sql(self, header, scoped=True):
        pairs = []
        for table in TABLE_KEYS:
            if table == 'auth.users': condition = f"r.id={literal(header['owner_id'])}::uuid"
            elif table == 'public.profiles': condition = f"r.user_id={literal(header['owner_id'])}::uuid"
            elif table == 'public.organizations': condition = f"r.id={literal(header['organization_id'])}::uuid"
            else: condition = f"r.organization_id={literal(header['organization_id'])}::uuid"
            pairs.append(literal(table)+f",(select coalesce(jsonb_agg({self.projection(table)}),'[]'::jsonb) from {table} r"+
                         (f' where {condition}' if scoped else '')+')')
        return 'jsonb_build_object('+','.join(pairs)+')'

    def capture(self, header, database='postgres', scoped=True):
        output = self.sql('begin isolation level repeatable read read only; select '+self.capture_sql(header, scoped)+'; commit;', database)
        return checkpoint(header, json.loads(output))

    def apply(self, database, before, after, packet_hash, fail_after=None):
        """Atomic restore/replay; exact already-applied retry is a no-op.

        USER triggers are disabled only while loading verified historical rows in
        the disconnected recovery DB. Foreign keys/checks remain active. Trigger
        changes, rows, history and the durable retry marker commit/rollback together.
        """
        verify_checkpoint(after)
        if before is not None: verify_checkpoint(before)
        header = {k:after[k] for k in HEADER}; self.guard_database(database, header['run_id'])
        old_tables = before['tables'] if before else {t:[] for t in TABLE_KEYS}
        expected_before = self.capture_sql(header, scoped=False)
        statements = ["begin; set local statement_timeout='30s';",
                      'lock table '+','.join(TABLE_KEYS)+' in access exclusive mode;',
                      f"do $$begin perform 1 from private.recovery_control where mode='frozen' for update; if not found then raise exception 'Recovery writer is active'; end if; end;$$;",
                      f"create temporary table recovery_attempt as select applied_hash={literal(packet_hash)} as already from private.recovery_control;"]
        # All assertions run after table/authority locks, closing read/check/write races.
        statements.append(f"""do $$declare actual jsonb := {expected_before}; expected jsonb;
          begin
            expected := case when coalesce((select already from recovery_attempt),false)
              then {encoded(after['tables'])} else {encoded(old_tables)} end;
            if exists(select 1 from jsonb_each(expected) e where
              (select count(*) from jsonb_array_elements(actual->e.key))<>jsonb_array_length(e.value)
              or not ((actual->e.key) @> e.value and e.value @> (actual->e.key))) then raise exception 'Recovery checkpoint precondition mismatch'; end if;
          end;$$;""")
        for table in TABLE_KEYS:
            statements.append(f'alter table {table} disable trigger user;')
        operations = 0
        for table in TABLE_KEYS:
            rows = after['tables'][table]
            prior = {tuple(r[k] for k in TABLE_KEYS[table]):r for r in old_tables[table]}
            for row in rows:
                old = prior.get(tuple(row[k] for k in TABLE_KEYS[table]))
                if row == old: continue
                fields = ','.join(column(c) for c in row)
                values = f'select {fields} from jsonb_populate_record(null::{table},{encoded(row)})'
                if old is None:
                    mutation = f'insert into {table} ({fields}) {values};'
                else:
                    predicate = ' and '.join(column(k)+'='+literal(row[k]) for k in TABLE_KEYS[table])
                    mutation = f'update {table} set ({fields})=({values}) where {predicate};'
                statements.append('do $restore$begin if not coalesce((select already from recovery_attempt),false) then '+mutation+' end if;end;$restore$;')
                operations += 1
                if fail_after == operations:
                    statements.append("do $$begin raise exception 'Injected mid-restore failure';end;$$;")
        for table in TABLE_KEYS:
            statements.append(f'alter table {table} enable trigger user;')
        org, owner = header['organization_id'], header['owner_id']
        statements.append(f"""insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
          values({literal(org)},{literal(owner)},'owner','suspended',now()) on conflict(organization_id,user_id) do nothing;
          do $$begin if exists(select 1 from public.organization_memberships where status='active') then raise exception 'Recovery write access must remain frozen';end if;end;$$;""")
        statements.append(f"""do $$declare actual jsonb := {self.capture_sql(header, scoped=False)}; expected jsonb := {encoded(after['tables'])};
          begin if exists(select 1 from jsonb_each(expected) e where
            (select count(*) from jsonb_array_elements(actual->e.key))<>jsonb_array_length(e.value)
            or not((actual->e.key) @> e.value and e.value @> (actual->e.key))) then raise exception 'Recovery final reconciliation failed';end if;end;$$;""")
        integrity_query = self.integrity_sql().strip().removesuffix(';')
        statements.append(f"""do $$declare checks jsonb:=({integrity_query}); begin
          if exists(select 1 from jsonb_each(checks) c where c.value<>'true'::jsonb) then
            raise exception 'Recovery history/reference integrity failed'; end if; end;$$;""")
        statements.append(f"update private.recovery_control set applied_hash={literal(packet_hash)}; commit;")
        self.sql('\n'.join(statements), database)
        actual = self.capture(header, database, scoped=False)
        require(reconcile(after, actual['tables'])['verified'], 'Post-commit reconciliation failed')
        return actual

    def integrity_sql(self):
        return """select jsonb_build_object(
          'schedule_history_valid',not exists(select 1 from public.schedules s where
            (select count(*) from public.schedule_versions v where v.schedule_id=s.id)<>s.document_version
            or (select min(version) from public.schedule_versions v where v.schedule_id=s.id)<>1
            or (select max(version) from public.schedule_versions v where v.schedule_id=s.id)<>s.document_version
            or not exists(select 1 from public.schedule_versions v where v.schedule_id=s.id and v.version=s.document_version
              and v.document=s.document and v.document_schema_version=s.document_schema_version
              and v.metadata->>'display_name'=s.display_name and v.metadata->>'status'=s.status))
            and not exists(select 1 from public.schedule_versions v where
              v.checksum<>encode(extensions.digest(convert_to(v.document::text,'UTF8'),'sha256'),'hex')
              or v.metadata_checksum<>encode(extensions.digest(convert_to(v.metadata::text,'UTF8'),'sha256'),'hex')),
          'related_history_valid',not exists(select 1 from private.migration_records r where
            (select count(*) from private.migration_record_versions v where v.record_id=r.id)<>r.version
            or (select min(version) from private.migration_record_versions v where v.record_id=r.id)<>1
            or (select max(version) from private.migration_record_versions v where v.record_id=r.id)<>r.version
            or not exists(select 1 from private.migration_record_versions v where v.record_id=r.id and v.version=r.version
              and v.snapshot=private.migration_record_state(r) and v.fingerprint=r.fingerprint))
            and not exists(select 1 from private.migration_record_versions v where v.fingerprint<>private.migration_fingerprint(v.snapshot)),
          'related_references_valid',not exists(select 1 from private.migration_records r
            cross join lateral jsonb_each_text(r.schedule_refs) ref
            left join public.schedules s on s.id=ref.value::uuid and s.organization_id=r.organization_id where s.id is null),
          'all_user_triggers_enabled',not exists(select 1 from pg_trigger where not tgisinternal and tgenabled='D'),
          'no_credentials_or_sessions',not exists(select 1 from auth.users where coalesce(encrypted_password,'')<>'') and not exists(select 1 from auth.sessions));"""

    def integrity(self, database):
        result = self.sql(self.integrity_sql(),database)
        value = json.loads(result); require(all(value.values()), 'Restored database integrity check failed'); return value

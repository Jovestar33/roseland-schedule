#!/usr/bin/env python3
"""Real local database races. Creates fictional fixtures in a disposable container.

Fixtures remain for inspection until the disposable stack is removed. No hosted
URL, credentials, destructive cleanup or existing fixture identifiers accepted.
"""
import argparse
import json
import queue
import subprocess
import threading
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', required=True)
args = parser.parse_args()
info = json.loads(subprocess.check_output(['docker', 'inspect', args.container], text=True))[0]
assert info['Name'].startswith('/supabase_db_'), 'Expected a local Supabase container'
assert 'supabase/postgres' in info['Config']['Image'], 'Expected Supabase Postgres'


def command(app='schedule-race'):
    return ['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + app, args.container,
            'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']


def sql(statement):
    result = subprocess.run(command(), input=statement, text=True, capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def race(kind, operation):
    owner, editor, org, production, day, schedule = [str(uuid.uuid4()) for _ in range(6)]
    marker = uuid.uuid4().hex
    sql(f"""begin;
    insert into auth.users(id,email,role,aud,email_confirmed_at) values
      ('{owner}','owner-{marker}@example.test','authenticated','authenticated',now()),
      ('{editor}','editor-{marker}@example.test','authenticated','authenticated',now());
    insert into public.organizations(id,name,slug) values('{org}','Schedule race fixture','schedule-race-{marker}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('{org}','{owner}','owner','active',now()),('{org}','{editor}','member','active',now());
    insert into public.productions(id,organization_id,name,slug) values('{production}','{org}','Fictional race','race');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)
      values('{org}','{production}','{editor}','editor','active',now());
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by)
      values('{day}','{org}','{production}',0,'{owner}','{owner}');
    insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,document,created_by,updated_by)
      values('{schedule}','{org}','{production}','{day}','Fictional race','race','{{"meta":{{}},"rows":[]}}','{owner}','{owner}');
    commit;""")
    auth = f"set local role authenticated; select set_config('request.jwt.claims','{{\"sub\":\"{editor}\",\"role\":\"authenticated\"}}',true);"
    update = f"select public.update_schedule_document('{schedule}',1,'{{\"meta\":{{\"town\":\"Winner\"}},\"rows\":[]}}',1);"
    if operation == 'archive':
        update = f"select public.mutate_schedule('{schedule}',1,'archive','{{}}');"
    suspend = f"update public.production_memberships set status='suspended' where production_id='{production}' and user_id='{editor}';"
    if kind == 'two-writers':
        first_sql, second_sql, expected_error, version = auth + update, auth + update, 'PT409', 2
    elif kind == 'suspension-first':
        first_sql, second_sql, expected_error, version = suspend, auth + update, 'PT404', 1
    else:
        first_sql, second_sql, expected_error, version = auth + update, suspend, None, 2
    first = subprocess.Popen(command('schedule-first-' + marker), stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
    lines = queue.Queue()
    def reader():
        for line in first.stdout:
            lines.put(line.strip())
    threading.Thread(target=reader, daemon=True).start()
    second = None
    try:
        first.stdin.write("begin; set local statement_timeout='20s'; " + first_sql + " select 'READY';\n")
        first.stdin.flush()
        deadline = time.monotonic() + 15
        while lines.get(timeout=max(0.01, deadline-time.monotonic())) != 'READY':
            assert time.monotonic() < deadline, 'First transaction failed to lock'
        second_app = 'schedule-second-' + marker
        second = subprocess.Popen(command(second_app), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        second.stdin.write("\\set VERBOSITY verbose\nbegin; set local statement_timeout='20s'; " + second_sql + ' commit;\n')
        second.stdin.close()
        deadline = time.monotonic() + 10
        blocked = False
        while time.monotonic() < deadline:
            if sql(f"select exists(select 1 from pg_stat_activity where application_name='{second_app}' and wait_event_type='Lock')") == 't':
                blocked = True
                break
            if second.poll() is not None:
                break
            time.sleep(0.05)
        assert blocked, 'Expected a real lock wait, not timing-only concurrency'
        first.stdin.write('commit;\n')
        first.stdin.close()
        first.wait(timeout=20)
        second.wait(timeout=20)
        assert first.returncode == 0, first.stderr.read()
        error = second.stderr.read()
        assert (second.returncode != 0 and expected_error in error) if expected_error else second.returncode == 0, error
        state = json.loads(sql(f"""select json_build_object(
          'version',s.document_version,'history',(select count(*) from public.schedule_versions v where v.schedule_id=s.id),
          'same',(select v.document=s.document from public.schedule_versions v where v.schedule_id=s.id and v.version=s.document_version),
          'suspended',(select status='suspended' from public.production_memberships where production_id='{production}' and user_id='{editor}')
          ) from public.schedules s where id='{schedule}';"""))
        assert state['version'] == version and state['history'] == version and state['same'], state
        if kind != 'two-writers':
            assert state['suspended'], state
            denied = subprocess.run(command(), input="\\set VERBOSITY verbose\nbegin; " + auth + update + ' rollback;', text=True, capture_output=True)
            assert denied.returncode != 0 and 'PT404' in denied.stderr, 'Subsequent write after suspension must fail'
        print(f'PASS: {operation}/{kind}; real lock wait, version/history consistent', flush=True)
    finally:
        for proc in [first, second]:
            if proc and proc.poll() is None:
                proc.kill()
                proc.wait()


for operation in ['document','archive']:
    for scenario in ['two-writers', 'suspension-first', 'write-first']:
        race(scenario, operation)
print('6/6 schedule concurrency scenarios passed; synthetic fixtures retained in disposable stack.')

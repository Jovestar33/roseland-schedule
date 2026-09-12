#!/usr/bin/env python3
"""Real two-connection races. Docker-local only; use a disposable Supabase stack.

Fixtures are committed because connections must share them, then deleted by ID.
Never accepts a hosted database URL or credentials.
"""
import argparse
import json
import queue
import subprocess
import threading
import time
import uuid

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--container', required=True, help='Disposable local Supabase Postgres container')
args = parser.parse_args()
info = json.loads(subprocess.check_output(['docker', 'inspect', args.container], text=True))[0]
assert info['Name'].startswith('/supabase_db_'), 'Expected a Supabase local database container'
assert 'supabase/postgres' in info['Config']['Image'], 'Expected the Supabase Postgres image'


def command(app='permission-race-check'):
    return ['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + app, args.container,
            'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']


def sql(statement):
    return subprocess.run(command(), input=statement, text=True, capture_output=True, check=True, timeout=30).stdout.strip()


def session(app):
    proc = subprocess.Popen(command(app), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, bufsize=1)
    lines = queue.Queue()
    def read():
        for line in proc.stdout:
            lines.put(line.strip())
    threading.Thread(target=read, daemon=True).start()
    return proc, lines


def send(proc, statement):
    proc.stdin.write(statement + '\n')
    proc.stdin.flush()


def ready(lines):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if lines.get(timeout=max(0.01, deadline - time.monotonic())) == 'READY':
            return
    raise AssertionError('First connection did not acquire its locks')


def race(scope, first_action, preexisting=True):
    org, production, owner, member, invitation = [str(uuid.uuid4()) for _ in range(5)]
    marker = uuid.uuid4().hex
    org_member_exists = preexisting or scope == 'production'
    setup = f"""
    begin;
    insert into auth.users(id,email,role,aud,email_confirmed_at) values
      ('{owner}','owner-{marker}@example.test','authenticated','authenticated',now()),
      ('{member}','member-{marker}@example.test','authenticated','authenticated',now());
    insert into public.organizations(id,name,slug) values('{org}','Concurrency fixture','race-{marker}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('{org}','{owner}','owner','active',now());
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
      select '{org}','{member}','member','active',now() where {'true' if org_member_exists else 'false'};
    insert into public.productions(id,organization_id,name,slug) values('{production}','{org}','Race','race');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)
      select '{org}','{production}','{member}','editor','active',now() where {'true' if preexisting else 'false'};
    insert into public.organization_invitations(id,organization_id,email,production_id,production_role,expires_at,created_by)
      values('{invitation}','{org}','member-{marker}@example.test','{production}','viewer',now()+interval '1 day','{owner}');
    commit;
    """
    sql(setup)  # Fails atomically on any collision; no existing fixtures are overwritten.
    table = 'organization_memberships' if scope == 'organization' else 'production_memberships'
    predicate = f"organization_id='{org}' and user_id='{member}'"
    accept = f"set local role authenticated; select set_config('request.jwt.claims','{{\"sub\":\"{member}\",\"role\":\"authenticated\"}}',true); select public.accept_organization_invitation('{invitation}');"
    suspend = f"update public.{table} set status='suspended' where {predicate};"
    if not preexisting:
        if scope == 'organization':
            suspend = f"insert into public.organization_memberships(organization_id,user_id,role,status) values('{org}','{member}','member','suspended') on conflict(organization_id,user_id) do update set status='suspended';"
        else:
            suspend = f"insert into public.production_memberships(organization_id,production_id,user_id,role,status) values('{org}','{production}','{member}','editor','suspended') on conflict(production_id,user_id) do update set status='suspended';"
    first_sql, second_sql = (accept, suspend) if first_action == 'accept' else (suspend, accept)
    first = second = None
    try:
        first, lines = session('permission-first-' + marker)
        send(first, "begin; set local statement_timeout='15s'; " + first_sql + " select 'READY';")
        ready(lines)
        second_app = 'permission-second-' + marker
        second = subprocess.Popen(command(second_app), stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        second.stdin.write("begin; set local statement_timeout='15s'; " + second_sql + ' commit;\n')
        second.stdin.close()
        # Observe a real database lock wait; timing alone is not evidence of a race.
        deadline = time.monotonic() + 10
        blocked = False
        while time.monotonic() < deadline:
            if sql(f"select exists(select 1 from pg_stat_activity where application_name='{second_app}' and wait_event_type='Lock')") == 't':
                blocked = True
                break
            if second.poll() is not None:
                break
            time.sleep(0.05)
        assert blocked, 'Second transaction did not block on the first transaction'
        send(first, 'commit;\n\\q')
        first.stdin.close()
        assert first.wait(timeout=10) == 0, first.stderr.read()
        code = second.wait(timeout=15)
        error = second.stderr.read()
        if first_action == 'suspend':
            assert code != 0 and 'invitation unavailable' in error, error
        else:
            assert code == 0, error
        assert sql(f"select status from public.{table} where {predicate}") == 'suspended'
        expected = 'expired' if first_action == 'suspend' else 'accepted'
        assert sql(f"select status from public.organization_invitations where id='{invitation}'") == expected
        print(f'PASS: {scope}, {first_action} first, preexisting={preexisting}; lock wait observed, final membership suspended', flush=True)
    finally:
        # Terminate only this fixture's connections if a failed assertion left a
        # transaction open; never let cleanup wait behind an abandoned row lock.
        sql(f"select pg_terminate_backend(pid) from pg_stat_activity where application_name in ('permission-first-{marker}','permission-second-{marker}') and pid <> pg_backend_pid()")
        for proc in (second, first):
            if proc is not None and proc.poll() is None:
                proc.kill()
                proc.wait(timeout=5)
        sql(f"""begin;
          delete from public.audit_events where organization_id='{org}';
          delete from public.organization_invitations where organization_id='{org}';
          delete from public.production_memberships where organization_id='{org}';
          delete from public.productions where organization_id='{org}';
          delete from public.organization_memberships where organization_id='{org}';
          delete from public.organizations where id='{org}';
          delete from auth.users where id in ('{owner}','{member}');
          commit;""")


for scope in ('organization', 'production'):
    for first_action in ('accept', 'suspend'):
        for preexisting in (True, False):
            race(scope, first_action, preexisting)
print('8/8 concurrent invitation/suspension scenarios passed.')

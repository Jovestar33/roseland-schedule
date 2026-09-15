begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
select ok(exists (
  select 1 from pg_db_role_setting r cross join lateral unnest(r.setconfig) setting
  where r.setrole=(select oid from pg_roles where rolname='authenticator')
    and r.setdatabase=(select oid from pg_database where datname=current_database())
    and setting='pgrst.db_pre_request=public.check_application_session'
), 'Data API admission is configured for this database');
select ok(not (select prosecdef from pg_proc where oid='public.check_application_session()'::regprocedure),
  'admission observes the impersonated role instead of its owner');
select ok(not has_function_privilege('authenticated','private.require_request_session(uuid,uuid,bigint)','EXECUTE'), 'clients cannot choose a private actor session');
select ok(not has_function_privilege('anon','private.require_request_session(uuid,uuid,bigint)','EXECUTE'), 'anonymous callers cannot choose a private actor session');
select ok(not has_function_privilege('service_role','private.require_request_session(uuid,uuid,bigint)','EXECUTE'), 'service calls use the bounded public adapter');
select ok(not has_function_privilege('authenticated','public.require_service_actor_session(uuid,uuid,bigint)','EXECUTE'), 'clients cannot invoke the trusted actor adapter');
select ok(not has_function_privilege('anon','public.require_service_actor_session(uuid,uuid,bigint)','EXECUTE'), 'anonymous callers cannot invoke the trusted actor adapter');
select ok(has_function_privilege('service_role','public.require_service_actor_session(uuid,uuid,bigint)','EXECUTE'), 'trusted service may validate its verified actor');
select ok(not has_table_privilege('authenticated','auth.sessions','SELECT'), 'session checks do not expose the session table');
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'authenticated role always needs an active session');
reset role;
set local role anon;
select lives_ok('select public.check_application_session()', 'anonymous requests retain existing grants and RLS');
reset role;
set local role service_role;
select set_config('request.path','/rpc/create_organization_invitation',true);
select set_config('request.headers','{}',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'invitation create requires actor binding');
select set_config('request.path','/rpc/revoke_organization_invitation',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'invitation revoke requires actor binding');
select set_config('request.path','/rpc/provision_customer_organization',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'provisioning requires actor binding');
select set_config('request.headers','{"x-actor-user-id":"bad","x-actor-session-id":"bad","x-actor-session-exp":"9999999999"}',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'malformed service headers produce bounded denial');
select set_config('request.path','/rpc/bootstrap_first_organization',true);
select lives_ok('select public.check_application_session()', 'trusted bootstrap is explicitly outside the human workflow admission policy');
reset role;
select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data)
select md5('console-user-'||n)::uuid,'console-'||n||'@example.test','authenticated','authenticated',now(),
 jsonb_build_object('b08_terms',terms_version,'b08_privacy',privacy_version)
from generate_series(1,3)n cross join private.account_policy_versions;
insert into auth.sessions(id,user_id,created_at,updated_at)
select md5('console-session-'||n)::uuid,md5('console-user-'||n)::uuid,now(),now() from generate_series(1,3)n;
insert into private.platform_operators(user_id,role,designation_reason)values(md5('console-user-1')::uuid,'superadmin','Fictional transactional console test');
insert into public.organizations(id,name,slug)values(md5('console-org')::uuid,'Console test organization','console-test-organization');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
values(md5('console-org')::uuid,md5('console-user-2')::uuid,'owner','active',now());
create function pg_temp.console_actor(n integer) returns uuid language plpgsql as $$begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.headers',jsonb_build_object('x-actor-user-id',md5('console-user-'||n)::uuid,'x-actor-aal','aal2','x-actor-session-id',md5('console-session-'||n)::uuid,'x-actor-session-exp',extract(epoch from now()+interval '1 hour')::bigint)::text,true);
 return md5('console-user-'||n)::uuid;
end;$$;
select extensions.ok(not has_function_privilege('anon','public.read_platform_console(uuid,text,timestamptz,text,uuid,text)','execute'),'anonymous cannot call console');
select extensions.ok(not has_function_privilege('authenticated','public.read_platform_console(uuid,text,timestamptz,text,uuid,text)','execute'),'browser cannot call service console directly');
select extensions.ok(not has_schema_privilege('authenticated','private','usage'),'private schema remains unavailable to browser');
select extensions.ok(not has_schema_privilege('service_role','private','usage'),'console does not open the existing private schema');
select extensions.ok(not has_table_privilege('service_role','private.platform_operators','select'),'no operator-table grant added');
select extensions.ok(not (select prosecdef from pg_proc where oid='public.read_platform_console(uuid,text,timestamptz,text,uuid,text)'::regprocedure),'public wrapper is invoker');
set local role service_role;
select extensions.is(public.read_platform_console(pg_temp.console_actor(2),'aal2',now(),'access')->>'authorized','false','organization owner is not platform admin');
select extensions.throws_ok($$select public.read_platform_console(pg_temp.console_actor(2),'aal2',now(),'organizations')$$,'PT403','Platform access unavailable','organization owner cannot list platform metadata');
select extensions.is(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'access')->>'authorized','true','active platform admin discovered');
select extensions.is(jsonb_array_length(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations',null,'Console test organization')->'organizations'),1,'search is applied on the server');
select extensions.is(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations',null,'Console test organization')->'organizations'->0->>'can_open','false','platform authority does not add tenant membership');
select extensions.is(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations',null,'Console test organization')->'organizations'->0->>'status','active','operational status returned');
select extensions.is(jsonb_array_length(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations',null,'unmatched-fixture')->'organizations'),0,'empty result is explicit');
select extensions.is(jsonb_array_length(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations',md5('console-org')::uuid,'Console test organization')->'organizations'),0,'cursor excludes previous page');
select extensions.throws_ok($$select public.read_platform_console(pg_temp.console_actor(1),'aal2',now()-interval '16 minutes','organizations')$$,'PT403','Recent authentication is required','metadata requires fresh authentication');
select extensions.throws_ok($$select public.read_platform_console(pg_temp.console_actor(1),'aal1',now(),'organizations')$$,'PT403','Platform access unavailable','MFA required');
select pg_temp.console_actor(2);
select extensions.throws_ok($$select public.read_platform_console(md5('console-user-1')::uuid,'aal2',now(),'organizations')$$,'PT403','Platform access unavailable','actor substitution rejected');
reset role;
update private.platform_operators set active=false,disabled_at=now() where user_id=md5('console-user-1')::uuid;
set local role service_role;
select extensions.is(public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'access')->>'authorized','false','disabled designation removed immediately');
select extensions.throws_ok($$select public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'organizations')$$,'PT403','Platform access unavailable','disabled operator loses listing');
reset role;
update private.platform_operators set active=true,disabled_at=null where user_id=md5('console-user-1')::uuid;
update auth.sessions set not_after=now()-interval '1 second' where id=md5('console-session-1')::uuid;
set local role service_role;
select extensions.throws_ok($$select public.read_platform_console(pg_temp.console_actor(1),'aal2',now(),'access')$$,'PT401','Active session required','revoked session rejected even for discovery');
reset role;
select * from extensions.finish();
rollback;

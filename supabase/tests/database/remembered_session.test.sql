begin;
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
select extensions.ok(not has_table_privilege('authenticated','private.account_session_preferences','SELECT,INSERT,UPDATE,DELETE'),'browser has no direct preference access');
select extensions.ok(not has_table_privilege('service_role','private.account_session_preferences','SELECT,INSERT,UPDATE,DELETE'),'server key cannot directly promote sessions');
select extensions.ok(not has_function_privilege('anon','public.set_account_session_remembered(boolean)','EXECUTE'),'anonymous bootstrap denied');
select extensions.ok(not has_function_privilege('service_role','public.set_account_session_remembered(boolean)','EXECUTE'),'bootstrap requires a genuine user session');
select extensions.ok(not has_function_privilege('authenticated','private.account_session_idle_window(uuid,uuid)','EXECUTE'),'arbitrary-session helper is private');
insert into auth.users(id,email,role,aud,email_confirmed_at)
values(md5('remembered-owner')::uuid,'remembered-owner@example.test','authenticated','authenticated',now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values(md5('remembered-session')::uuid,md5('remembered-owner')::uuid,now(),now());
insert into public.organizations(id,name,slug) values(md5('remembered-org')::uuid,'Remembered test','remembered-test');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
values(md5('remembered-org')::uuid,md5('remembered-owner')::uuid,'owner','active',now());
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('remembered-owner')::uuid,'role','authenticated','session_id',md5('remembered-session')::uuid,'exp',extract(epoch from now()+interval '1 hour')::bigint,'aal','aal1','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('request.path','/rpc/set_account_session_remembered',true);
set local role authenticated;
select extensions.lives_ok('select public.set_account_session_remembered(true)','fresh password session may register before MFA');
select extensions.is(public.mfa_organization_access(md5('remembered-org')::uuid),false,'remembering does not bypass Owner MFA');
select extensions.throws_ok('select public.set_account_session_remembered(false)','PT409','Sign in again to change this session preference','preference cannot change in an existing session');
reset role;
select extensions.is(private.account_session_idle_window(md5('different-user')::uuid,md5('remembered-session')::uuid),interval '60 minutes','preference cannot cross actors');
select set_config('request.jwt.claims',jsonb_build_object('sub',md5('remembered-owner')::uuid,'role','authenticated','session_id',md5('remembered-session')::uuid,'exp',extract(epoch from now()+interval '1 hour')::bigint,'aal','aal2','amr',jsonb_build_array(jsonb_build_object('method','totp','timestamp',extract(epoch from now()-interval '2 hours')::bigint)))::text,true);
select extensions.is(public.mfa_organization_access(md5('remembered-org')::uuid),true,'verified Owner still has ordinary access');
select extensions.throws_ok('select private.require_recent_totp()','PT403','mfa_recent_required','remembered session does not bypass critical recent-verification requirement');
update auth.sessions set not_after=now()+interval '10 minutes' where id=md5('remembered-session')::uuid;
select extensions.ok(public.get_account_session_deadline()<=now()+interval '10 minutes','server deadline respects earlier provider expiration');
update auth.sessions set not_after=null where id=md5('remembered-session')::uuid;
insert into private.account_session_activity values(md5('remembered-session')::uuid,md5('remembered-owner')::uuid,clock_timestamp()-interval '7 days');
set local role authenticated;
select extensions.throws_ok('select public.get_account_session_deadline()','PT401','Active session required','exact seven-day inactivity boundary fails closed');
reset role;
delete from auth.sessions where id=md5('remembered-session')::uuid;
select extensions.is((select count(*) from private.account_session_preferences where session_id=md5('remembered-session')::uuid),0::bigint,'session deletion removes preference');
select * from extensions.finish();
rollback;

begin;
-- SQL-only fixture for the trusted server's verified actor headers. Genuine
-- Auth/MFA/HTTP acceptance is tested separately; this never signs a JWT.
create function pg_temp.assured_actor(actor uuid) returns uuid language plpgsql as $assure$
begin
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform set_config('request.headers',jsonb_build_object('x-actor-user-id',actor,'x-actor-aal','aal2')::text,true);
 return actor;
end;$assure$;

create extension if not exists pgtap with schema extensions;
select no_plan();
select ok(not has_function_privilege('authenticated','public.create_organization_invitation_with_days(uuid,uuid,text,public.organization_role,uuid,public.production_role,integer,text,timestamptz,text)','EXECUTE'), 'days endpoint is not callable by ordinary clients');
select ok(not has_function_privilege('anon','public.create_organization_invitation_with_days(uuid,uuid,text,public.organization_role,uuid,public.production_role,integer,text,timestamptz,text)','EXECUTE'), 'days endpoint is not anonymous');
select ok(has_function_privilege('service_role','public.create_organization_invitation_with_days(uuid,uuid,text,public.organization_role,uuid,public.production_role,integer,text,timestamptz,text)','EXECUTE'), 'trusted server can use stable expiry days');
select ok(not has_function_privilege('service_role','private.create_organization_invitation_request(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text,jsonb)','EXECUTE'), 'service cannot substitute arbitrary private fingerprint input');
select ok(not has_function_privilege('authenticated','private.lock_workflow_rate(text,uuid,uuid)','EXECUTE'), 'clients cannot hold arbitrary rate locks');
select ok(not has_function_privilege('service_role','private.workflow_fingerprint(jsonb)','EXECUTE'), 'fingerprint helper stays private');
select ok(not has_column_privilege('authenticated','private.workflow_requests','request_fingerprint','SELECT'), 'request fingerprints stay private');
set local role service_role;
select set_config('request.path','/rpc/create_organization_invitation_with_days',true);
select set_config('request.headers','{}',true);
select throws_ok('select public.check_application_session()', 'PT401', 'Active session required', 'days endpoint requires the same verified actor-session binding');
reset role;
select throws_ok($$select public.create_organization_invitation(null::uuid,null::uuid,'fiction@example.test','member'::public.organization_role,
 null::uuid,null::public.production_role,'2099-01-01T00:00:00Z','aal2',now(),'legacy-literal-test')$$,
 'P0001','invitation workflow unavailable','legacy positional timestamp literal still resolves before ordinary validation');

insert into auth.users(id,email,role,aud,email_confirmed_at) values
 ('a6111111-1111-4111-8111-111111111111','workflow-owner@example.test','authenticated','authenticated',now()),
 ('a6222222-2222-4222-8222-222222222222','workflow-recipient@example.test','authenticated','authenticated',now());
insert into private.platform_operators(user_id,role,designation_reason) values('a6111111-1111-4111-8111-111111111111','superadmin','Fictional SQL test');
insert into public.organizations(id,name,slug) values('a6333333-3333-4333-8333-333333333333','Fictional workflow tenant','workflow-sql-tenant');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
 values('a6333333-3333-4333-8333-333333333333','a6111111-1111-4111-8111-111111111111','owner','active',now());
insert into public.organization_invitations(id,organization_id,email,organization_role,expires_at,created_by)
 values('a6444444-4444-4444-8444-444444444444','a6333333-3333-4333-8333-333333333333','revoke-workflow@example.test','member',now()+interval '7 days','a6111111-1111-4111-8111-111111111111');

set local role service_role;
select set_config('test.workflow_org',public.provision_customer_organization(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6222222-2222-4222-8222-222222222222',
 'Fictional customer','workflow-sql-customer','UTC','en-US','US','USD','Reviewed','aal2',now(),'workflow-sql-provision')::text,true);
select is(public.provision_customer_organization(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6222222-2222-4222-8222-222222222222',
 'Fictional customer','workflow-sql-customer','UTC','en-US','US','USD',' Reviewed ','aal2',now(),'workflow-sql-provision')::text,
 current_setting('test.workflow_org'),'normalized identical provisioning returns the first resource');
select set_config('test.workflow_invitation',public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333','Days@Example.Test','member',null,null,7,'aal2',now(),'workflow-sql-invite')::text,true);
select is(public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333',' days@example.test ','member',null,null,7,'aal2',now(),'workflow-sql-invite')::text,
 current_setting('test.workflow_invitation'),'equivalent email and days replay the same invitation');
select throws_ok($$select public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333','days@example.test','member',null,null,8,'aal2',now(),'workflow-sql-invite')$$,
 'PT409','Workflow request conflict','changed expiry duration conflicts');
select lives_ok($$select public.revoke_organization_invitation(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6444444-4444-4444-8444-444444444444','Reviewed','aal2',now(),'workflow-sql-revoke')$$,'pending invitation revocation succeeds');
select is(public.revoke_organization_invitation(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6444444-4444-4444-8444-444444444444',' Reviewed ','aal2',now(),'workflow-sql-revoke')::text,
 'a6444444-4444-4444-8444-444444444444','normalized revocation retry returns original terminal resource');
select throws_ok($$select public.revoke_organization_invitation(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6444444-4444-4444-8444-444444444444','Changed','aal2',now(),'workflow-sql-revoke')$$,
 'PT409','Workflow request conflict','changed revocation reason conflicts');
select throws_ok($$select public.provision_customer_organization(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6222222-2222-4222-8222-222222222222',
 'Fictional customer','workflow-sql-customer','UTC','en-US','US','USD','Reviewed',null,now(),'workflow-sql-provision')$$,
 'P0001','organization workflow unavailable','NULL AAL cannot replay provisioning');
select throws_ok($$select public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333','days@example.test','member',null,null,7,null,now(),'workflow-sql-invite')$$,
 'P0001','invitation workflow unavailable','NULL AAL cannot replay an invitation');
select throws_ok($$select public.revoke_organization_invitation(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6444444-4444-4444-8444-444444444444','Reviewed',null,now(),'workflow-sql-revoke')$$,
 'P0001','invitation workflow unavailable','NULL AAL cannot replay revocation');
reset role;
select is((select count(*) from public.audit_events where actor_user_id='a6111111-1111-4111-8111-111111111111'),3::bigint,'three workflows produce exactly three audit events');
select is((select count(*) from private.workflow_requests where actor_user_id='a6111111-1111-4111-8111-111111111111' and request_fingerprint ~ '^[0-9a-f]{64}$'),3::bigint,'three successful requests retain canonical fingerprints');
select is((select expires_at from public.organization_invitations where id=current_setting('test.workflow_invitation')::uuid),now()+interval '7 days','days endpoint stores the first request expiry');

set local timezone='Pacific/Auckland';
set local role service_role;
select is(public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333','days@example.test','member',null,null,7,'aal2',now(),'workflow-sql-invite')::text,
 current_setting('test.workflow_invitation'),'recent authentication and identical retry are independent of database timezone');
reset role;
set local timezone='UTC';

-- Existing rows from before this migration cannot safely prove their original
-- business input. Never backfill from a potentially edited current resource.
update private.workflow_requests set request_fingerprint=null where actor_user_id='a6111111-1111-4111-8111-111111111111';
set local role service_role;
select throws_ok($$select public.provision_customer_organization(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6222222-2222-4222-8222-222222222222',
 'Fictional customer','workflow-sql-customer','UTC','en-US','US','USD','Reviewed','aal2',now(),'workflow-sql-provision')$$,
 'PT409','Workflow request conflict','legacy provisioning record with unknown input fails closed');
select throws_ok($$select public.create_organization_invitation_with_days(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6333333-3333-4333-8333-333333333333','days@example.test','member',null,null,7,'aal2',now(),'workflow-sql-invite')$$,
 'PT409','Workflow request conflict','legacy invitation record with unknown input fails closed');
select throws_ok($$select public.revoke_organization_invitation(
 pg_temp.assured_actor('a6111111-1111-4111-8111-111111111111'),'a6444444-4444-4444-8444-444444444444','Reviewed','aal2',now(),'workflow-sql-revoke')$$,
 'PT409','Workflow request conflict','legacy revocation record with unknown input fails closed');
reset role;
select is((select count(*) from public.audit_events where actor_user_id='a6111111-1111-4111-8111-111111111111'),3::bigint,'failed legacy replays leave audit/state untouched');
select * from finish();
rollback;

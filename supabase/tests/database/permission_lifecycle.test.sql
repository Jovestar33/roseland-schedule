begin;
set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions;
select extensions.no_plan();

insert into auth.users(id,email,role,aud,email_confirmed_at)
select md5('permission-user-' || n)::uuid, 'permission-' || n || '@example.test', 'authenticated','authenticated',now()
from generate_series(1,4) n;
insert into public.organizations(id,name,slug)
values(md5('permission-org')::uuid,'Permission fixture','permission-lifecycle-fixture');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)
select md5('permission-org')::uuid,md5('permission-user-' || n)::uuid,
(case when n=1 then 'owner' else 'member' end)::public.organization_role,'active',now()
from generate_series(1,3) n;
insert into public.productions(id,organization_id,name,slug)
values(md5('permission-production')::uuid,md5('permission-org')::uuid,'Permission production','permission-production');
insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)
select md5('permission-org')::uuid,md5('permission-production')::uuid,md5('permission-user-' || n)::uuid,
(case when n=2 then 'editor' else 'viewer' end)::public.production_role,'active',now()
from generate_series(2,3) n;
insert into public.organization_invitations(id,organization_id,email,organization_role,expires_at,created_by)
values(md5('permission-invite')::uuid,md5('permission-org')::uuid,'permission-4@example.test','member',now()+interval '1 day',md5('permission-user-1')::uuid);
insert into public.audit_events(organization_id,action,resource_type)
values(md5('permission-org')::uuid,'fixture.created','fixture');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-1')::uuid,'role','authenticated')::text,true);
select extensions.ok(public.is_active_org_member(md5('permission-org')::uuid),'active organization membership works');
select extensions.ok(public.is_org_admin(md5('permission-org')::uuid),'active organization owner works');
select extensions.is((select count(*) from public.organization_invitations where organization_id=md5('permission-org')::uuid),1::bigint,'active owner can read invitations');
select extensions.is((select count(*) from public.audit_events where organization_id=md5('permission-org')::uuid),1::bigint,'active owner can read audit');
set local role postgres;
update public.organizations set deleted_at=now() where id=md5('permission-org')::uuid;
set local role authenticated;
select extensions.is(public.is_active_org_member(md5('permission-org')::uuid),false,'deleted organization denies membership helper');
select extensions.is(public.is_org_admin(md5('permission-org')::uuid),false,'deleted organization denies admin helper');
select extensions.is(public.can_access_production(md5('permission-production')::uuid),false,'deleted organization denies owner child access');
select extensions.is(public.can_edit_production(md5('permission-production')::uuid),false,'deleted organization denies owner child edits');
select extensions.is((select count(*) from public.organization_invitations where organization_id=md5('permission-org')::uuid),0::bigint,'deleted organization hides invitations');
select extensions.is((select count(*) from public.audit_events where organization_id=md5('permission-org')::uuid),0::bigint,'deleted organization hides audit');
select extensions.is((select count(*) from public.organization_memberships where organization_id=md5('permission-org')::uuid),0::bigint,'deleted organization hides memberships');
select extensions.is((select count(*) from public.production_memberships where organization_id=md5('permission-org')::uuid),0::bigint,'deleted organization hides production memberships');
select extensions.throws_ok($$insert into public.productions(organization_id,name,slug,created_by) values(md5('permission-org')::uuid,'Denied','denied',auth.uid())$$,'42501',null,'deleted organization rejects new productions');
select extensions.results_eq($$update public.productions set name='Denied' where id=md5('permission-production')::uuid returning id$$,$$select null::uuid where false$$,'deleted organization owner update affects no children');
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-2')::uuid,'role','authenticated')::text,true);
select extensions.is(public.can_access_production(md5('permission-production')::uuid),false,'deleted organization denies assigned editor read');
select extensions.is(public.can_edit_production(md5('permission-production')::uuid),false,'deleted organization denies assigned editor write');
select extensions.is((select count(*) from public.productions where id=md5('permission-production')::uuid),0::bigint,'deleted organization hides editor production');
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-3')::uuid,'role','authenticated')::text,true);
select extensions.is((select count(*) from public.productions where id=md5('permission-production')::uuid),0::bigint,'deleted organization hides viewer production');

set local role postgres;
update public.organizations set deleted_at=null where id=md5('permission-org')::uuid;
-- Existing strong roles must never be implicitly reactivated by an invitation.
insert into public.organization_invitations(id,organization_id,email,organization_role,production_id,production_role,expires_at,created_by)
values(md5('permission-suspension-invite')::uuid,md5('permission-org')::uuid,'permission-2@example.test','member',md5('permission-production')::uuid,'viewer',now()+interval '1 day',md5('permission-user-1')::uuid);
update public.organization_memberships set status='suspended' where organization_id=md5('permission-org')::uuid and user_id=md5('permission-user-2')::uuid;
select extensions.is((select status::text from public.organization_invitations where id=md5('permission-suspension-invite')::uuid),'expired','organization suspension invalidates pending invitation');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-2')::uuid,'role','authenticated')::text,true);
select extensions.throws_ok($$select public.accept_organization_invitation(md5('permission-suspension-invite')::uuid)$$,'P0001','invitation unavailable','old invite cannot reinstate organization membership');
set local role postgres;
select extensions.is((select status::text from public.organization_memberships where organization_id=md5('permission-org')::uuid and user_id=md5('permission-user-2')::uuid),'suspended','organization remains suspended');
-- A newly issued invitation while suspended must also fail, even if not invalidated by the transition trigger.
update public.organization_invitations set status='expired' where id=md5('permission-suspension-invite')::uuid and status='pending';
insert into public.organization_invitations(id,organization_id,email,expires_at,created_by)
values(md5('permission-after-suspension')::uuid,md5('permission-org')::uuid,'permission-2@example.test',now()+interval '1 day',md5('permission-user-1')::uuid);
set local role authenticated;
select extensions.throws_ok($$select public.accept_organization_invitation(md5('permission-after-suspension')::uuid)$$,'P0001','invitation unavailable','new invite cannot reinstate suspended organization member');
set local role postgres;
-- Explicit test-only reinstatement allows testing the independent production boundary.
update public.organization_memberships set status='active' where organization_id=md5('permission-org')::uuid and user_id=md5('permission-user-2')::uuid;
insert into public.organization_invitations(id,organization_id,email,production_id,production_role,expires_at,created_by)
values(md5('permission-production-invite')::uuid,md5('permission-org')::uuid,'permission-2@example.test',md5('permission-production')::uuid,'viewer',now()+interval '1 day',md5('permission-user-1')::uuid);
update public.production_memberships set status='suspended' where production_id=md5('permission-production')::uuid and user_id=md5('permission-user-2')::uuid;
select extensions.is((select status::text from public.organization_invitations where id=md5('permission-production-invite')::uuid),'expired','production suspension invalidates its pending invitation');
select extensions.is((select status::text from public.organization_invitations where id=md5('permission-after-suspension')::uuid),'pending','production suspension does not invalidate organization-only invite');
set local role authenticated;
select extensions.throws_ok($$select public.accept_organization_invitation(md5('permission-production-invite')::uuid)$$,'P0001','invitation unavailable','old invite cannot reinstate production member');
set local role postgres;
select extensions.is((select status::text from public.production_memberships where production_id=md5('permission-production')::uuid and user_id=md5('permission-user-2')::uuid),'suspended','production membership remains suspended');
update public.organization_invitations set status='expired' where id=md5('permission-production-invite')::uuid and status='pending';
insert into public.organization_invitations(id,organization_id,email,production_id,production_role,expires_at,created_by)
values(md5('permission-production-new-invite')::uuid,md5('permission-org')::uuid,'permission-2@example.test',md5('permission-production')::uuid,'viewer',now()+interval '1 day',md5('permission-user-1')::uuid);
set local role authenticated;
select extensions.throws_ok($$select public.accept_organization_invitation(md5('permission-production-new-invite')::uuid)$$,'P0001','invitation unavailable','new invite cannot reinstate suspended production editor');
select extensions.lives_ok($$select public.accept_organization_invitation(md5('permission-after-suspension')::uuid)$$,'organization-only invitation remains valid after explicit organization reinstatement');
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-4')::uuid,'role','authenticated')::text,true);
select extensions.lives_ok($$select public.accept_organization_invitation(md5('permission-invite')::uuid)$$,'new unsuspended member can still accept invitation');
set local role postgres;
-- A low-role invitation cannot restore an old suspended owner's stronger role.
update public.organization_memberships set status='suspended'
where organization_id=md5('permission-org')::uuid and user_id=md5('permission-user-1')::uuid;
insert into public.organization_invitations(id,organization_id,email,organization_role,expires_at,created_by)
values(md5('permission-owner-invite')::uuid,md5('permission-org')::uuid,'permission-1@example.test','member',now()+interval '1 day',md5('permission-user-4')::uuid);
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',md5('permission-user-1')::uuid,'role','authenticated')::text,true);
select extensions.throws_ok($$select public.accept_organization_invitation(md5('permission-owner-invite')::uuid)$$,'P0001','invitation unavailable','member invitation cannot restore suspended owner');
set local role postgres;
select extensions.is((select role::text || ':' || status::text from public.organization_memberships where organization_id=md5('permission-org')::uuid and user_id=md5('permission-user-1')::uuid),'owner:suspended','denied acceptance preserves suspended owner state');
select extensions.ok(exists(select 1 from public.audit_events where organization_id=md5('permission-org')::uuid and action='organization.invitation.invalidated' and metadata->>'reason'='membership_suspended'),'suspension invalidation is audited');
select extensions.ok(not has_function_privilege('anon','private.invalidate_suspended_member_invitations()','EXECUTE') and not has_function_privilege('authenticated','private.invalidate_suspended_member_invitations()','EXECUTE') and not has_function_privilege('service_role','private.invalidate_suspended_member_invitations()','EXECUTE'),'invalidation trigger is not an executable RPC');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('is_active_org_member','is_org_admin','accept_organization_invitation')) or (n.nspname='private' and p.proname='invalidate_suspended_member_invitations') group by p.oid having not p.prosecdef or p.proconfig is distinct from array['search_path=""']::text[]),'changed privileged functions keep an empty search path');
select * from extensions.finish();
rollback;

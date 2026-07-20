begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions, pgtap;
select extensions.plan(31);

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'private.platform_operators'::regclass), 'platform_operators has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.organization_invitations'::regclass), 'organization_invitations has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit_events has RLS enabled');
select extensions.is(has_schema_privilege('authenticated', 'private', 'USAGE'), false, 'authenticated cannot use the private schema');
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.bootstrap_first_organization(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot execute platform bootstrap'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.bootstrap_first_organization(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service role can execute platform bootstrap'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.accept_organization_invitation(uuid)', 'EXECUTE'),
  'authenticated can execute invitation acceptance'
);

insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('41000000-0000-4000-a000-000000000001', 'owner@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{"display_name":"Initial Owner"}'),
  ('41000000-0000-4000-a000-000000000002', 'invitee@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{"display_name":"Invited Editor"}'),
  ('41000000-0000-4000-a000-000000000003', 'outsider@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}');

set local role service_role;
do $$
begin
  perform public.bootstrap_first_organization(
    '41000000-0000-4000-a000-000000000001',
    'Roseland Pictures',
    'roseland-pictures',
    'America/New_York',
    'en-US',
    'US',
    'USD'
  );
end;
$$;
set local role postgres;

select extensions.is((select count(*) from public.organizations), 1::bigint, 'bootstrap creates one organization');
select extensions.is(
  (select role::text || ':' || status::text from public.organization_memberships where user_id = '41000000-0000-4000-a000-000000000001'),
  'owner:active',
  'bootstrap creates the active organization owner'
);
select extensions.is(
  (select role::text || ':' || active::text || ':' || mfa_required::text from private.platform_operators where user_id = '41000000-0000-4000-a000-000000000001'),
  'superadmin:true:true',
  'bootstrap creates an active MFA-required superadmin operator'
);
select extensions.is(
  (select count(*) from public.audit_events where action = 'platform.bootstrap.completed'),
  1::bigint,
  'bootstrap creates one audit event'
);
select extensions.throws_ok(
  $$select public.bootstrap_first_organization('41000000-0000-4000-a000-000000000002', 'Other', 'other')$$,
  'P0001',
  'platform bootstrap is no longer available',
  'bootstrap cannot be replayed'
);
select extensions.is((select count(*) from public.profiles), 3::bigint, 'auth user trigger creates profiles');

insert into public.productions (id, organization_id, name, slug, created_by, updated_by)
select
  '43000000-0000-4000-a000-000000000001',
  o.id,
  'Test Production',
  'test-production',
  '41000000-0000-4000-a000-000000000001',
  '41000000-0000-4000-a000-000000000001'
from public.organizations o;

insert into public.organization_invitations (
  id,
  organization_id,
  email,
  organization_role,
  production_id,
  production_role,
  expires_at,
  created_by
)
select
  '44000000-0000-4000-a000-000000000001',
  o.id,
  'Invitee@Example.Test',
  'member',
  '43000000-0000-4000-a000-000000000001',
  'editor',
  now() + interval '7 days',
  '41000000-0000-4000-a000-000000000001'
from public.organizations o;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000002","email":"invitee@example.test","role":"authenticated"}', true);
select extensions.lives_ok(
  $$select public.accept_organization_invitation('44000000-0000-4000-a000-000000000001')$$,
  'matching authenticated recipient accepts invitation'
);
set local role postgres;

select extensions.is(
  (select status::text from public.organization_invitations where id = '44000000-0000-4000-a000-000000000001'),
  'accepted',
  'accepted invitation is terminal'
);
select extensions.is(
  (select role::text || ':' || status::text from public.organization_memberships where user_id = '41000000-0000-4000-a000-000000000002'),
  'member:active',
  'acceptance creates active organization membership'
);
select extensions.is(
  (select role::text || ':' || status::text from public.production_memberships where user_id = '41000000-0000-4000-a000-000000000002'),
  'editor:active',
  'acceptance creates active production editor membership'
);
select extensions.is(
  (select count(*) from public.audit_events where action = 'organization.invitation.accepted'),
  1::bigint,
  'acceptance creates one audit event'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000002","email":"invitee@example.test","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.accept_organization_invitation('44000000-0000-4000-a000-000000000001')$$,
  'P0001',
  'invitation unavailable',
  'accepted invitation cannot be replayed'
);
set local role postgres;

insert into public.organization_invitations (
  id,
  organization_id,
  email,
  organization_role,
  expires_at,
  created_by
)
select
  '44000000-0000-4000-a000-000000000002',
  o.id,
  'invitee@example.test',
  'member',
  now() + interval '7 days',
  '41000000-0000-4000-a000-000000000001'
from public.organizations o;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000003","email":"outsider@example.test","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.accept_organization_invitation('44000000-0000-4000-a000-000000000002')$$,
  'P0001',
  'invitation unavailable',
  'different authenticated email cannot accept invitation'
);
set local role postgres;
select extensions.is(
  (select status::text from public.organization_invitations where id = '44000000-0000-4000-a000-000000000002'),
  'pending',
  'wrong-email attempt leaves invitation pending'
);

insert into auth.users (id, email, role, aud, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values (
  '41000000-0000-4000-a000-000000000004',
  'unverified@example.test',
  'authenticated',
  'authenticated',
  '',
  '{}',
  '{}'
);

insert into public.organization_invitations (
  id,
  organization_id,
  email,
  organization_role,
  expires_at,
  created_by
)
select
  '44000000-0000-4000-a000-000000000003',
  o.id,
  'unverified@example.test',
  'member',
  now() + interval '7 days',
  '41000000-0000-4000-a000-000000000001'
from public.organizations o;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000004","email":"unverified@example.test","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.accept_organization_invitation('44000000-0000-4000-a000-000000000003')$$,
  'P0001',
  'invitation unavailable',
  'unverified authenticated email cannot accept invitation'
);
set local role postgres;
select extensions.is(
  (select status::text from public.organization_invitations where id = '44000000-0000-4000-a000-000000000003'),
  'pending',
  'unverified-email attempt leaves invitation pending'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000001","email":"owner@example.test","role":"authenticated"}', true);
select extensions.is((select count(*) from public.organization_invitations), 3::bigint, 'organization owner sees organization invitations');
select extensions.is((select count(*) from public.audit_events), 2::bigint, 'organization owner sees organization audit events');

select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-a000-000000000002","email":"invitee@example.test","role":"authenticated"}', true);
select extensions.is((select count(*) from public.profiles), 1::bigint, 'authenticated user sees only own profile');
select extensions.is((select count(*) from public.organization_invitations), 0::bigint, 'non-admin member cannot list invitations');
select extensions.is((select count(*) from public.audit_events), 0::bigint, 'non-admin member cannot list audit events');
select extensions.is(
  has_table_privilege('authenticated', 'public.organization_invitations', 'INSERT'),
  false,
  'authenticated cannot insert invitations directly'
);
select extensions.is(
  has_table_privilege('authenticated', 'public.audit_events', 'INSERT'),
  false,
  'authenticated cannot insert audit events directly'
);

set local role postgres;
select * from extensions.finish();
rollback;

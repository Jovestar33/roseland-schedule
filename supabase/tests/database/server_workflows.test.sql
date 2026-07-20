begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions, pgtap;
select extensions.plan(36);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'private.workflow_requests'::regclass),
  'workflow request idempotency table has RLS enabled'
);
select extensions.is(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  false,
  'authenticated cannot use the private workflow schema'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call organization provisioning directly'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.create_organization_invitation(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call invitation creation directly'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.revoke_organization_invitation(uuid,uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated cannot call invitation revocation directly'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot call organization provisioning'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.create_organization_invitation(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot call invitation creation'
);
select extensions.is(
  has_function_privilege(
    'anon',
    'public.revoke_organization_invitation(uuid,uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot call invitation revocation'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can call organization provisioning'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.create_organization_invitation(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can call invitation creation'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.revoke_organization_invitation(uuid,uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can call invitation revocation'
);

insert into auth.users (
  id,
  email,
  role,
  aud,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values
  ('51000000-0000-4000-a000-000000000001', 'platform@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('51000000-0000-4000-a000-000000000002', 'owner@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('51000000-0000-4000-a000-000000000003', 'admin@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('51000000-0000-4000-a000-000000000004', 'member@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('51000000-0000-4000-a000-000000000005', 'outsider@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('51000000-0000-4000-a000-000000000006', 'second@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}');

set local role service_role;
do $$
begin
  perform public.bootstrap_first_organization(
    '51000000-0000-4000-a000-000000000001',
    'Roseland Pictures',
    'roseland-pictures',
    'America/New_York',
    'en-US',
    'US',
    'USD'
  );

  perform public.provision_customer_organization(
    '51000000-0000-4000-a000-000000000001',
    '51000000-0000-4000-a000-000000000002',
    'Customer Studio',
    'customer-studio',
    'Asia/Dubai',
    'en-AE',
    'AE',
    'AED',
    'Approved pilot customer provisioning',
    'aal2',
    now(),
    'provision-0001'
  );
end;
$$;
set local role postgres;
select set_config(
  'test.customer_org_id',
  (select id::text from public.organizations where slug = 'customer-studio'),
  true
);

select extensions.is((select count(*) from public.organizations), 2::bigint, 'operator provisioning creates a second organization');
select extensions.is(
  (
    select m.role::text || ':' || m.status::text
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where o.slug = 'customer-studio'
      and m.user_id = '51000000-0000-4000-a000-000000000002'
  ),
  'owner:active',
  'provisioning assigns the verified customer owner'
);
select extensions.is(
  (select count(*) from public.audit_events where action = 'organization.provisioned'),
  1::bigint,
  'provisioning creates one audit event'
);

set local role service_role;
select extensions.lives_ok(
  $$select public.provision_customer_organization(
    '51000000-0000-4000-a000-000000000001',
    '51000000-0000-4000-a000-000000000002',
    'Ignored Retry',
    'ignored-retry',
    'UTC',
    'en',
    null,
    null,
    'Idempotent retry',
    'aal2',
    now(),
    'provision-0001'
  )$$,
  'provisioning is idempotent for the same actor and request ID'
);
set local role postgres;
select extensions.is((select count(*) from public.organizations), 2::bigint, 'idempotent provisioning does not create another organization');

set local role service_role;
select extensions.throws_ok(
  $$select public.provision_customer_organization(
    '51000000-0000-4000-a000-000000000002',
    '51000000-0000-4000-a000-000000000003',
    'Denied Studio', 'denied-studio', 'UTC', 'en', null, null,
    'Unauthorized attempt', 'aal2', now(), 'provision-0002'
  )$$,
  'P0001',
  'organization workflow unavailable',
  'non-operator cannot provision an organization'
);
select extensions.throws_ok(
  $$select public.provision_customer_organization(
    '51000000-0000-4000-a000-000000000001',
    '51000000-0000-4000-a000-000000000003',
    'Weak Session', 'weak-session', 'UTC', 'en', null, null,
    'Weak session attempt', 'aal1', now(), 'provision-0003'
  )$$,
  'P0001',
  'organization workflow unavailable',
  'operator provisioning requires MFA'
);
select extensions.throws_ok(
  $$select public.provision_customer_organization(
    '51000000-0000-4000-a000-000000000001',
    '51000000-0000-4000-a000-000000000003',
    'Stale Session', 'stale-session', 'UTC', 'en', null, null,
    'Stale session attempt', 'aal2', now() - interval '16 minutes', 'provision-0004'
  )$$,
  'P0001',
  'organization workflow unavailable',
  'operator provisioning requires recent authentication'
);

select extensions.lives_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000002',
    current_setting('test.customer_org_id')::uuid,
    'Admin@Example.Test',
    'admin',
    null,
    null,
    now() + interval '7 days',
    'aal2',
    now(),
    'invite-admin-0001'
  )$$,
  'owner can create an administrator invitation'
);
set local role postgres;
select set_config(
  'test.admin_invitation_id',
  (select id::text from public.organization_invitations where email_normalized = 'admin@example.test'),
  true
);
select extensions.is(
  (select status::text || ':' || organization_role::text from public.organization_invitations where email_normalized = 'admin@example.test'),
  'pending:admin',
  'created invitation has the intended pending administrator role'
);
select extensions.is(
  (select count(*) from public.audit_events where action = 'organization.invitation.created'),
  1::bigint,
  'invitation creation is audited'
);

set local role service_role;
select extensions.lives_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000002',
    current_setting('test.customer_org_id')::uuid,
    'different@example.test',
    'member',
    null,
    null,
    now() + interval '8 days',
    'aal2',
    now(),
    'invite-admin-0001'
  )$$,
  'invitation creation is idempotent for the same actor and request ID'
);
set local role postgres;
select extensions.is(
  (select count(*) from public.organization_invitations where organization_id = (select id from public.organizations where slug = 'customer-studio')),
  1::bigint,
  'idempotent invitation retry creates no duplicate'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-a000-000000000003","email":"admin@example.test","role":"authenticated"}', true);
select extensions.lives_ok(
  $$select public.accept_organization_invitation(current_setting('test.admin_invitation_id')::uuid)$$,
  'invited administrator can accept with the matching verified email'
);
set local role postgres;
select extensions.is(
  (
    select role::text || ':' || status::text
    from public.organization_memberships
    where organization_id = (select id from public.organizations where slug = 'customer-studio')
      and user_id = '51000000-0000-4000-a000-000000000003'
  ),
  'admin:active',
  'accepted invitation activates the administrator membership'
);

set local role service_role;
select extensions.throws_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000003',
    current_setting('test.customer_org_id')::uuid,
    'outsider@example.test', 'owner', null, null,
    now() + interval '7 days', 'aal2', now(), 'invite-owner-denied-0001'
  )$$,
  'P0001',
  'invitation workflow unavailable',
  'administrator cannot grant owner or administrator roles'
);
select extensions.lives_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000003',
    current_setting('test.customer_org_id')::uuid,
    'member@example.test', 'member', null, null,
    now() + interval '7 days', 'aal2', now(), 'invite-member-0001'
  )$$,
  'administrator can create a member invitation'
);
set local role postgres;
select set_config(
  'test.member_invitation_id',
  (select id::text from public.organization_invitations where email_normalized = 'member@example.test'),
  true
);
set local role service_role;
select extensions.lives_ok(
  $$select public.revoke_organization_invitation(
    '51000000-0000-4000-a000-000000000003',
    current_setting('test.member_invitation_id')::uuid,
    'Recipient no longer requires access',
    'aal2',
    now(),
    'revoke-member-0001'
  )$$,
  'administrator can revoke a pending member invitation'
);
set local role postgres;
select extensions.is(
  (select status::text from public.organization_invitations where email_normalized = 'member@example.test'),
  'revoked',
  'revocation makes the invitation terminal'
);
select extensions.is(
  (select count(*) from public.audit_events where action = 'organization.invitation.revoked'),
  1::bigint,
  'invitation revocation is audited'
);

set local role service_role;
select extensions.lives_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000002',
    current_setting('test.customer_org_id')::uuid,
    'outsider@example.test', 'owner', null, null,
    now() + interval '7 days', 'aal2', now(), 'invite-owner-0001'
  )$$,
  'organization owner can create another owner invitation'
);
set local role postgres;
select set_config(
  'test.owner_invitation_id',
  (select id::text from public.organization_invitations where email_normalized = 'outsider@example.test'),
  true
);
set local role service_role;
select extensions.throws_ok(
  $$select public.revoke_organization_invitation(
    '51000000-0000-4000-a000-000000000003',
    current_setting('test.owner_invitation_id')::uuid,
    'Unauthorized role revocation', 'aal2', now(), 'revoke-owner-denied-0001'
  )$$,
  'P0001',
  'invitation workflow unavailable',
  'administrator cannot revoke an owner invitation'
);
select extensions.throws_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000005',
    current_setting('test.customer_org_id')::uuid,
    'second@example.test', 'member', null, null,
    now() + interval '7 days', 'aal2', now(), 'invite-outsider-0001'
  )$$,
  'P0001',
  'invitation workflow unavailable',
  'non-member cannot create an organization invitation'
);

set local role postgres;
insert into public.productions (id, organization_id, name, slug, created_by, updated_by)
select
  '53000000-0000-4000-a000-000000000001',
  o.id,
  'Roseland Production',
  'roseland-production',
  '51000000-0000-4000-a000-000000000001',
  '51000000-0000-4000-a000-000000000001'
from public.organizations o
where o.slug = 'roseland-pictures';

set local role service_role;
select extensions.throws_ok(
  $$select public.create_organization_invitation(
    '51000000-0000-4000-a000-000000000002',
    current_setting('test.customer_org_id')::uuid,
    'second@example.test', 'member',
    '53000000-0000-4000-a000-000000000001', 'viewer',
    now() + interval '7 days', 'aal2', now(), 'invite-cross-org-0001'
  )$$,
  'P0001',
  'invitation workflow unavailable',
  'invitation cannot attach a production from another organization'
);

set local role postgres;
select extensions.is(
  has_table_privilege('authenticated', 'private.workflow_requests', 'SELECT'),
  false,
  'authenticated users cannot read workflow idempotency records'
);

set local role postgres;
select * from extensions.finish();
rollback;

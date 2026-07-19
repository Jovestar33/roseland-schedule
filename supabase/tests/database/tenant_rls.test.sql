begin;

-- The CLI's temporary linked-test login has no USAGE on the extensions schema.
-- Use the database owner only for fixture/pgTAP setup; RLS assertions below
-- explicitly switch to the authenticated application role.
set local role postgres;
create extension if not exists pgtap with schema extensions;
-- Hosted and local Supabase test runners may place pgTAP in either schema.
set local search_path = public, auth, extensions, pgtap;
select extensions.plan(22);

-- Fixed IDs make failures readable and keep this transaction-only fixture deterministic.
insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('10000000-0000-4000-a000-000000000001', 'owner-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('10000000-0000-4000-a000-000000000002', 'editor-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('10000000-0000-4000-a000-000000000003', 'viewer-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('10000000-0000-4000-a000-000000000004', 'owner-b@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('10000000-0000-4000-a000-000000000005', 'suspended-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}');

insert into public.organizations (id, name, slug)
values
  ('20000000-0000-4000-a000-000000000001', 'Organization A', 'organization-a'),
  ('20000000-0000-4000-a000-000000000002', 'Organization B', 'organization-b');

insert into public.organization_memberships
  (organization_id, user_id, role, status, joined_at)
values
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'owner', 'active', now()),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', 'member', 'active', now()),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000003', 'member', 'active', now()),
  ('20000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004', 'owner', 'active', now()),
  ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005', 'member', 'suspended', null);

insert into public.productions (id, organization_id, name, slug)
values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', 'Production A', 'production-a'),
  ('30000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000002', 'Production B', 'production-b');

insert into public.production_memberships
  (organization_id, production_id, user_id, role, status, joined_at)
values
  ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002', 'editor', 'active', now()),
  ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000003', 'viewer', 'active', now()),
  ('20000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000004', 'editor', 'active', now()),
  ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000005', 'editor', 'active', now());

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.organizations'::regclass), 'organizations has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.organization_memberships'::regclass), 'organization_memberships has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.productions'::regclass), 'productions has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.production_memberships'::regclass), 'production_memberships has RLS enabled');

set local role authenticated;

-- Organization A owner: organization-wide administration, but no visibility into B.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.organizations order by slug', $$values ('organization-a'::text)$$, 'owner A sees only organization A');
select extensions.results_eq('select slug from public.productions order by slug', $$values ('production-a'::text)$$, 'owner A sees production A without a production membership');
select extensions.ok(public.can_edit_production('30000000-0000-4000-a000-000000000001'), 'owner A can edit production A');
select extensions.is(public.can_access_production('30000000-0000-4000-a000-000000000002'), false, 'owner A cannot access production B');

-- Editor A: assigned production only and may edit.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.productions order by slug', $$values ('production-a'::text)$$, 'editor A sees only assigned production A');
select extensions.ok(public.can_edit_production('30000000-0000-4000-a000-000000000001'), 'editor A can edit production A');
select extensions.is(public.can_access_production('30000000-0000-4000-a000-000000000002'), false, 'editor A cannot access production B');
select extensions.throws_ok(
  $$update public.productions set organization_id = '20000000-0000-4000-a000-000000000002' where id = '30000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'production identity fields cannot be changed',
  'editor cannot move a production across organizations'
);
select extensions.throws_ok(
  $$update public.productions set deleted_at = now() where id = '30000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'only an organization owner or admin may change production deletion state',
  'editor cannot soft-delete a production'
);
select extensions.lives_ok(
  $$update public.productions set name = 'Production A edited' where id = '30000000-0000-4000-a000-000000000001'$$,
  'editor may update ordinary production fields'
);
select extensions.results_eq(
  $$select version from public.productions where id = '30000000-0000-4000-a000-000000000001'$$,
  $$values (2::bigint)$$,
  'successful production update increments its version'
);

-- Viewer A: assigned read access but no edit access.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.productions order by slug', $$values ('production-a'::text)$$, 'viewer A sees assigned production A');
select extensions.is(public.can_edit_production('30000000-0000-4000-a000-000000000001'), false, 'viewer A cannot edit production A');
select extensions.results_eq(
  $$update public.productions set name = 'Unauthorized' where id = '30000000-0000-4000-a000-000000000001' returning name$$,
  $$select null::text where false$$,
  'viewer update affects no rows'
);

-- Organization B owner is isolated from A.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.productions order by slug', $$values ('production-b'::text)$$, 'owner B sees only production B');
select extensions.is(public.can_access_production('30000000-0000-4000-a000-000000000001'), false, 'owner B cannot access production A');

-- A production membership cannot outlive/sidestep a suspended organization membership.
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.productions', $$select null::text where false$$, 'suspended organization member sees no productions');
select extensions.is(public.can_access_production('30000000-0000-4000-a000-000000000001'), false, 'suspended member cannot use an active production membership');

select * from extensions.finish();
rollback;

begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions, pgtap;
select extensions.plan(45);

insert into auth.users (id, email, role, aud, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('61000000-0000-4000-a000-000000000001', 'schedule-owner-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('61000000-0000-4000-a000-000000000002', 'schedule-editor-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('61000000-0000-4000-a000-000000000003', 'schedule-viewer-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('61000000-0000-4000-a000-000000000004', 'schedule-owner-b@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}'),
  ('61000000-0000-4000-a000-000000000005', 'schedule-suspended-a@example.test', 'authenticated', 'authenticated', '', now(), '{}', '{}');

insert into public.organizations (id, name, slug)
values
  ('62000000-0000-4000-a000-000000000001', 'Schedule Organization A', 'schedule-organization-a'),
  ('62000000-0000-4000-a000-000000000002', 'Schedule Organization B', 'schedule-organization-b');

insert into public.organization_memberships
  (organization_id, user_id, role, status, joined_at)
values
  ('62000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000001', 'owner', 'active', now()),
  ('62000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000002', 'member', 'active', now()),
  ('62000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000003', 'member', 'active', now()),
  ('62000000-0000-4000-a000-000000000002', '61000000-0000-4000-a000-000000000004', 'owner', 'active', now()),
  ('62000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000005', 'member', 'suspended', null);

insert into public.productions (id, organization_id, name, slug, created_by, updated_by)
values
  ('63000000-0000-4000-a000-000000000001', '62000000-0000-4000-a000-000000000001', 'Schedule Production A', 'schedule-production-a', '61000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000001'),
  ('63000000-0000-4000-a000-000000000002', '62000000-0000-4000-a000-000000000002', 'Schedule Production B', 'schedule-production-b', '61000000-0000-4000-a000-000000000004', '61000000-0000-4000-a000-000000000004');

insert into public.production_memberships
  (organization_id, production_id, user_id, role, status, joined_at)
values
  ('62000000-0000-4000-a000-000000000001', '63000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000002', 'editor', 'active', now()),
  ('62000000-0000-4000-a000-000000000001', '63000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000003', 'viewer', 'active', now()),
  ('62000000-0000-4000-a000-000000000002', '63000000-0000-4000-a000-000000000002', '61000000-0000-4000-a000-000000000004', 'editor', 'active', now()),
  ('62000000-0000-4000-a000-000000000001', '63000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000005', 'editor', 'active', now());

insert into public.phases
  (id, organization_id, production_id, name, phase_type, position, created_by, updated_by)
values
  ('64000000-0000-4000-a000-000000000001', '62000000-0000-4000-a000-000000000001', '63000000-0000-4000-a000-000000000001', 'Shoot A', 'shoot', 0, '61000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000001'),
  ('64000000-0000-4000-a000-000000000002', '62000000-0000-4000-a000-000000000002', '63000000-0000-4000-a000-000000000002', 'Shoot B', 'shoot', 0, '61000000-0000-4000-a000-000000000004', '61000000-0000-4000-a000-000000000004');

insert into public.production_days
  (id, organization_id, production_id, phase_id, calendar_date, day_number, day_type, position, status, created_by, updated_by)
values
  ('65000000-0000-4000-a000-000000000001', '62000000-0000-4000-a000-000000000001', '63000000-0000-4000-a000-000000000001', '64000000-0000-4000-a000-000000000001', '2026-08-10', 1, 'work', 0, 'confirmed', '61000000-0000-4000-a000-000000000001', '61000000-0000-4000-a000-000000000001'),
  ('65000000-0000-4000-a000-000000000002', '62000000-0000-4000-a000-000000000002', '63000000-0000-4000-a000-000000000002', '64000000-0000-4000-a000-000000000002', '2026-08-11', 1, 'work', 0, 'confirmed', '61000000-0000-4000-a000-000000000004', '61000000-0000-4000-a000-000000000004');

insert into public.schedules
  (id, organization_id, production_id, production_day_id, display_name, slug, town, document, created_by, updated_by)
values
  (
    '66000000-0000-4000-a000-000000000001',
    '62000000-0000-4000-a000-000000000001',
    '63000000-0000-4000-a000-000000000001',
    '65000000-0000-4000-a000-000000000001',
    'Schedule A Day 1',
    'schedule-a-day-1',
    'New York',
    '{"meta":{"town":"New York"},"rows":[]}'::jsonb,
    '61000000-0000-4000-a000-000000000001',
    '61000000-0000-4000-a000-000000000001'
  ),
  (
    '66000000-0000-4000-a000-000000000002',
    '62000000-0000-4000-a000-000000000002',
    '63000000-0000-4000-a000-000000000002',
    '65000000-0000-4000-a000-000000000002',
    'Schedule B Day 1',
    'schedule-b-day-1',
    'Dubai',
    '{"meta":{"town":"Dubai"},"rows":[]}'::jsonb,
    '61000000-0000-4000-a000-000000000004',
    '61000000-0000-4000-a000-000000000004'
  );

select extensions.ok((select relrowsecurity from pg_class where oid = 'public.phases'::regclass), 'phases has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.production_days'::regclass), 'production_days has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.schedules'::regclass), 'schedules has RLS enabled');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.schedule_versions'::regclass), 'schedule_versions has RLS enabled');
select extensions.ok(
  not has_table_privilege('anon', 'public.phases', 'SELECT')
    and not has_table_privilege('anon', 'public.production_days', 'SELECT')
    and not has_table_privilege('anon', 'public.schedules', 'SELECT')
    and not has_table_privilege('anon', 'public.schedule_versions', 'SELECT'),
  'anonymous users have no schedule-domain table privileges'
);
select extensions.is((select count(*) from public.schedule_versions), 2::bigint, 'each schedule insert records its initial immutable version');

set local role authenticated;

-- Organization A owner can see and administer only production A.
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select extensions.results_eq('select name from public.phases order by name', $$values ('Shoot A'::text)$$, 'owner A sees only phase A');
select extensions.results_eq('select day_number from public.production_days', $$values (1::integer)$$, 'owner A sees only production day A');
select extensions.results_eq('select slug from public.schedules', $$values ('schedule-a-day-1'::text)$$, 'owner A sees only schedule A');
select extensions.results_eq('select version from public.schedule_versions', $$values (1::bigint)$$, 'owner A sees only schedule A history');
select extensions.is(public.can_access_production('63000000-0000-4000-a000-000000000002'), false, 'owner A cannot access production B schedule data');

-- Editor A can edit the assigned production and produces immutable versions.
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.schedules', $$values ('schedule-a-day-1'::text)$$, 'editor A sees assigned schedule A');
select extensions.lives_ok(
  $$update public.schedules
    set document = '{"meta":{"town":"New York"},"rows":[{"action":"Crew Call"}]}'::jsonb
    where id = '66000000-0000-4000-a000-000000000001'
      and document_version = 1$$,
  'editor A can update a current schedule document'
);
select extensions.is(
  (select document_version from public.schedules where id = '66000000-0000-4000-a000-000000000001'),
  2::bigint,
  'successful schedule update increments the document version'
);
select extensions.is(
  (select count(*) from public.schedule_versions where schedule_id = '66000000-0000-4000-a000-000000000001'),
  2::bigint,
  'successful schedule update records a second immutable version'
);
select extensions.ok(
  (select checksum ~ '^[a-f0-9]{64}$' from public.schedule_versions where schedule_id = '66000000-0000-4000-a000-000000000001' and version = 2),
  'recorded schedule version has a SHA-256 checksum'
);
select extensions.is(
  (select updated_by from public.schedules where id = '66000000-0000-4000-a000-000000000001'),
  '61000000-0000-4000-a000-000000000002'::uuid,
  'schedule update records the authenticated editor'
);
select extensions.results_eq(
  $$update public.schedules
    set town = 'Stale update'
    where id = '66000000-0000-4000-a000-000000000001'
      and document_version = 1
    returning town$$,
  $$select null::text where false$$,
  'stale optimistic update affects no schedule row'
);
select extensions.throws_ok(
  $$update public.schedules
    set document_version = 99
    where id = '66000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'schedule document version must be current',
  'client cannot forge a schedule document version'
);
select extensions.throws_ok(
  $$insert into public.schedules (
      organization_id, production_id, production_day_id, display_name, slug, created_by, updated_by
    ) values (
      '62000000-0000-4000-a000-000000000001',
      '63000000-0000-4000-a000-000000000001',
      '65000000-0000-4000-a000-000000000002',
      'Cross-production day',
      'cross-production-day',
      '61000000-0000-4000-a000-000000000002',
      '61000000-0000-4000-a000-000000000002'
    )$$,
  '23503',
  'insert or update on table "schedules" violates foreign key constraint "schedules_production_day_fk"',
  'schedule cannot reference a day from another tenant or production'
);
select extensions.throws_ok(
  $$update public.schedules set deleted_at = now() where id = '66000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'only an organization owner or admin may change schedule deletion state',
  'editor cannot soft-delete a schedule'
);
select extensions.lives_ok(
  $$update public.phases set name = 'Principal Photography A' where id = '64000000-0000-4000-a000-000000000001'$$,
  'editor can update an ordinary phase field'
);
select extensions.is(
  (select version from public.phases where id = '64000000-0000-4000-a000-000000000001'),
  2::bigint,
  'phase update increments its version'
);
select extensions.lives_ok(
  $$update public.production_days set status = 'completed' where id = '65000000-0000-4000-a000-000000000001'$$,
  'editor can update an ordinary production-day field'
);
select extensions.is(
  (select version from public.production_days where id = '65000000-0000-4000-a000-000000000001'),
  2::bigint,
  'production-day update increments its version'
);
select extensions.throws_ok(
  $$insert into public.phases (
      organization_id, production_id, name, position, created_by, updated_by
    ) values (
      '62000000-0000-4000-a000-000000000002',
      '63000000-0000-4000-a000-000000000002',
      'Unauthorized B phase',
      1,
      '61000000-0000-4000-a000-000000000002',
      '61000000-0000-4000-a000-000000000002'
    )$$,
  '42501',
  'new row violates row-level security policy for table "phases"',
  'editor A cannot insert a phase into production B'
);

-- Viewer A can read but cannot mutate schedule-domain rows or history.
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.schedules', $$values ('schedule-a-day-1'::text)$$, 'viewer A sees assigned schedule A');
select extensions.results_eq(
  $$update public.schedules set town = 'Unauthorized' where id = '66000000-0000-4000-a000-000000000001' returning town$$,
  $$select null::text where false$$,
  'viewer update affects no schedule row'
);
select extensions.throws_ok(
  $$insert into public.phases (
      organization_id, production_id, name, position, created_by, updated_by
    ) values (
      '62000000-0000-4000-a000-000000000001',
      '63000000-0000-4000-a000-000000000001',
      'Viewer phase',
      2,
      '61000000-0000-4000-a000-000000000003',
      '61000000-0000-4000-a000-000000000003'
    )$$,
  '42501',
  'new row violates row-level security policy for table "phases"',
  'viewer cannot insert a phase'
);
select extensions.throws_ok(
  $$update public.schedule_versions set label = 'Changed' where schedule_id = '66000000-0000-4000-a000-000000000001'$$,
  '42501',
  'permission denied for table schedule_versions',
  'authenticated user has no direct schedule-version update privilege'
);
select extensions.throws_ok(
  $$delete from public.schedules where id = '66000000-0000-4000-a000-000000000001'$$,
  '42501',
  'permission denied for table schedules',
  'authenticated user has no hard-delete privilege'
);

-- Organization B and suspended users remain isolated.
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
select extensions.results_eq('select slug from public.schedules', $$values ('schedule-b-day-1'::text)$$, 'owner B sees only schedule B');
select extensions.results_eq('select version from public.schedule_versions', $$values (1::bigint)$$, 'owner B sees only schedule B history');

select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
select extensions.is((select count(*) from public.phases), 0::bigint, 'suspended member sees no phases');
select extensions.is((select count(*) from public.production_days), 0::bigint, 'suspended member sees no production days');
select extensions.is((select count(*) from public.schedules), 0::bigint, 'suspended member sees no schedules');
select extensions.is((select count(*) from public.schedule_versions), 0::bigint, 'suspended member sees no schedule history');

-- Owner A can perform recoverable deletion while immutable history remains.
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update public.schedules set deleted_at = now() where id = '66000000-0000-4000-a000-000000000001'$$,
  'organization owner can soft-delete a schedule'
);
select extensions.is(
  (select count(*) from public.schedules where deleted_at is null),
  0::bigint,
  'soft-deleted schedule is excluded from active schedule reads'
);
select extensions.is(
  (select count(*) from public.schedule_versions where schedule_id = '66000000-0000-4000-a000-000000000001'),
  3::bigint,
  'soft deletion records another immutable recovery version'
);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.schedule_versions where schedule_id = '66000000-0000-4000-a000-000000000001'),
  0::bigint,
  'viewer cannot read history for a soft-deleted schedule'
);

-- Database constraints and immutable-history triggers protect trusted paths too.
set local role postgres;
select extensions.throws_ok(
  $$update public.schedule_versions set label = 'Changed by owner' where schedule_id = '66000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'schedule versions are immutable',
  'even the database owner cannot update immutable history accidentally'
);
select extensions.throws_ok(
  $$delete from public.schedule_versions where schedule_id = '66000000-0000-4000-a000-000000000001'$$,
  'P0001',
  'schedule versions are immutable',
  'even the database owner cannot delete immutable history accidentally'
);
select extensions.throws_ok(
  $$insert into public.production_days (
      organization_id, production_id, phase_id, day_number, position, created_by, updated_by
    ) values (
      '62000000-0000-4000-a000-000000000001',
      '63000000-0000-4000-a000-000000000001',
      '64000000-0000-4000-a000-000000000002',
      2,
      2,
      '61000000-0000-4000-a000-000000000001',
      '61000000-0000-4000-a000-000000000001'
    )$$,
  '23503',
  'insert or update on table "production_days" violates foreign key constraint "production_days_phase_fk"',
  'production day cannot reference a phase from another tenant or production'
);
select extensions.throws_ok(
  $$insert into public.schedules (
      organization_id, production_id, production_day_id, display_name, slug, document, created_by, updated_by
    ) values (
      '62000000-0000-4000-a000-000000000001',
      '63000000-0000-4000-a000-000000000001',
      '65000000-0000-4000-a000-000000000001',
      'Malformed schedule',
      'malformed-schedule',
      '{"meta":{},"rows":{}}'::jsonb,
      '61000000-0000-4000-a000-000000000001',
      '61000000-0000-4000-a000-000000000001'
    )$$,
  '23514',
  'new row for relation "schedules" violates check constraint "schedules_document_shape_check"',
  'database rejects a malformed top-level schedule document'
);

select * from extensions.finish();
rollback;

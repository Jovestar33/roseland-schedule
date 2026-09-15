begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions, pgtap;
select extensions.no_plan();

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


select extensions.ok(not has_table_privilege('authenticated','private.migration_records','SELECT'),'catalogue is not ordinary tenant content access');
select extensions.ok(not has_table_privilege('service_role','private.migration_records','INSERT'),'service role cannot bypass trusted importer');
select extensions.ok(not has_function_privilege('authenticated','private.import_related_record(uuid,text,text,text,text,uuid,bigint,jsonb,jsonb,boolean,bigint,text,uuid)','EXECUTE'),'no authenticated importer RPC');
select extensions.ok(not has_function_privilege('anon','private.migration_fingerprint(jsonb)','EXECUTE'),'private helper unavailable to anonymous users');
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',1,'{}','{"foreign":"66000000-0000-4000-a000-000000000002"}',false,0,null,'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'cross tenant references rejected');
select extensions.lives_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',1,'{}','{}',false,0,null,'72000000-0000-4000-a000-000000000001')$q$,'trusted importer creates catalogue record');
select extensions.lives_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',1,'{}','{}',false,1,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'identical retry skips after refreshing precondition');
select extensions.is((select count(*) from private.migration_record_versions where record_id='71000000-0000-4000-a000-000000000001'),1::bigint,'retry appends no history');
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',2,'{"labels":{}}','{}',false,0,null,'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'stale expected version rejected');
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',1,'{"labels":{}}','{}',false,1,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'same source revision cannot change data');
select extensions.lives_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',2,'{"labels":{}}','{}',false,1,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'new source revision appends history');
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',1,'{}','{}',false,2,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'old source revision rejected');
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',3,'{}','{}',true,2,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'tombstone cannot replace preserved payload');
select extensions.lives_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',3,'{"labels":{}}','{}',true,2,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'explicit tombstone retains old payload');
select extensions.throws_ok($q$delete from private.migration_record_versions where record_id='71000000-0000-4000-a000-000000000001'$q$,'P0001',null,'import history cannot be deleted');
select extensions.ok((select bool_and(fingerprint=private.migration_fingerprint(snapshot)) from private.migration_record_versions where record_id='71000000-0000-4000-a000-000000000001'),'every historical snapshot checksums correctly');
update private.migration_records set payload='{"labels":{"x":"drift"}}' where id='71000000-0000-4000-a000-000000000001';
select extensions.throws_ok($q$select private.import_related_record('62000000-0000-4000-a000-000000000001','synthetic','cms','rp_cms_config','','71000000-0000-4000-a000-000000000001',4,'{"labels":{}}','{}',false,3,(select fingerprint from private.migration_records where id='71000000-0000-4000-a000-000000000001'),'72000000-0000-4000-a000-000000000001')$q$,'P0001',null,'computed fingerprint catches target drift');
select * from extensions.finish(); rollback;

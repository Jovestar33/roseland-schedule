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

select extensions.ok(not has_table_privilege('authenticated','public.schedules','UPDATE'), 'direct UPDATE cannot bypass expected version');
select extensions.ok(not has_table_privilege('authenticated','public.schedules','INSERT'), 'direct INSERT is deferred to a validated create contract');
select extensions.ok(not has_function_privilege('anon','public.read_schedule(uuid)','EXECUTE'), 'anonymous RPC read denied');
select extensions.ok(not has_function_privilege('anon','public.update_schedule_document(uuid,bigint,jsonb,integer)','EXECUTE'), 'anonymous RPC update denied');
select extensions.ok(not has_function_privilege('authenticated','private.validate_schedule_document(jsonb,integer)','EXECUTE'), 'private validator is not a public callable API');

set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000001')$$,'PT401','Authentication required','missing identity fails closed');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated","aal":"aal2"}',true);
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000001')->>'display_name','Schedule A Day 1','owner reads schedule through RLS');
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000002')$$,'PT404','Schedule unavailable','cross-organization read discloses no document');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000002',1,'{"meta":{},"rows":[]}',1)$$,'PT404','Schedule unavailable','cross-organization update denied');
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000099')$$,'PT404','Schedule unavailable','unknown ID has the same response as denied access');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',null,'{"meta":{},"rows":[]}',1)$$,'PT400','Expected version is required','null expected version denied');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',0,'{"meta":{},"rows":[]}',1)$$,'PT400','Expected version is required','zero expected version denied');
select extensions.throws_ok($$select public.update_schedule_document(target_schedule_id => '66000000-0000-4000-a000-000000000001', next_document => '{"meta":{},"rows":[]}', schema_version => 1)$$,'42883',null,'omitting expected version cannot select an unsafe overload');

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000003","role":"authenticated","aal":"aal2"}',true);
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000001')->>'display_name','Schedule A Day 1','assigned viewer can read');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',1,'{"meta":{},"rows":[]}',1)$$,'PT404','Schedule unavailable','viewer cannot update');
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000005","role":"authenticated","aal":"aal2"}',true);
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000001')$$,'PT404','Schedule unavailable','suspended member cannot read');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',1,'{"meta":{},"rows":[]}',1)$$,'PT404','Schedule unavailable','suspended member cannot update');

select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated","aal":"aal2"}',true);
select extensions.lives_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',1,
'{"meta":{"town":"Updated town","date":"2026-08-10","callsheet":{"safetyNotes":"Fictional safety note"},"wx":{"maxC":30,"noForecast":false}},"rows":[{"action":"Shoot","desc":"Fictional scene","timeIn":"9:00 AM","dur":"00:00","fixedIn":true,"locLat":90,"locLng":-180,"contactName":"Fictional contact","subLocations":[{"id":"test","loc":"Gate","done":false,"locLat":null}]}],"savedAt":100}',1)$$,
'editor updates known legacy optional fields and zero duration');
select extensions.is((select document_version from public.schedules where id='66000000-0000-4000-a000-000000000001'),2::bigint,'version increments once');
select extensions.is((select town from public.schedules where id='66000000-0000-4000-a000-000000000001'),'Updated town','relational town synchronized with document');
select extensions.is((select updated_by from public.schedules where id='66000000-0000-4000-a000-000000000001'),'61000000-0000-4000-a000-000000000002'::uuid,'actor derives from authenticated identity');
select extensions.is((select count(*) from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000001'),2::bigint,'exactly one history entry appended');
select extensions.ok((select s.document=v.document and s.document_schema_version=v.document_schema_version and s.updated_by=v.created_by and v.checksum=encode(extensions.digest(convert_to(s.document::text,'UTF8'),'sha256'),'hex') from public.schedules s join public.schedule_versions v on v.schedule_id=s.id and v.version=s.document_version where s.id='66000000-0000-4000-a000-000000000001'),'document, schema, actor and checksum match history');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',1,'{"meta":{},"rows":[]}',1)$$,'PT409','Schedule changed; reload before saving','stale request returns conflict');
select extensions.throws_ok($$update public.schedules set document='{"meta":{},"rows":[]}' where id='66000000-0000-4000-a000-000000000001'$$,'42501','permission denied for table schedules','SQL writer cannot bypass RPC');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,'{"meta":{},"rows":[]}',2)$$,'PT400','Invalid schedule document','unknown schema version denied');

-- Invalid document cases use the same API that a direct PostgREST caller uses.
select extensions.throws_ok(format('select public.update_schedule_document(%L,2,%L::jsonb,1)','66000000-0000-4000-a000-000000000001',doc), 'PT400', 'Invalid schedule document', label)
from (values
 ('null','null document'),
 ('{}','missing document containers'),
 ('{"meta":[],"rows":[]}','metadata must be an object'),
 ('{"meta":{},"rows":{},"unknown":1}','rows must be an array'),
 ('{"meta":{},"rows":[],"unknown":1}','unknown root field rejected without dropping data'),
 ('{"meta":{},"rows":[null]}','null row rejected'),
 ('{"meta":{},"rows":[{"action":5}]}','wrong row type'),
 ('{"meta":{},"rows":[{"done":"yes"}]}','boolean type validation'),
 ('{"meta":{},"rows":[{"dur":"00:60"}]}','invalid duration'),
 ('{"meta":{},"rows":[{"timeIn":"25:00"}]}','invalid clock time'),
 ('{"meta":{},"rows":[{"locLat":91}]}','latitude range'),
 ('{"meta":{},"rows":[{"locLng":"nan"}]}','coordinate type'),
 ('{"meta":{},"rows":[{"subLocations":{}}]}','sub-location container'),
 ('{"meta":{},"rows":[{"subLocations":[null]}]}','sub-location object'),
 ('{"meta":{},"rows":[{"subLocations":[{"loc":"Gate","locLng":181}]}]}','sub-location coordinate range'),
 ('{"meta":{},"rows":[{"subLocations":[{"loc":"Gate","unknown":true}]}]}','unknown sub-location field'),
 ('{"meta":{"date":"2026-02-30"},"rows":[]}','real calendar date'),
 ('{"meta":{"lat":-91},"rows":[]}','metadata latitude'),
 ('{"meta":{"dayNumber":1.5},"rows":[]}','integer day number'),
 ('{"meta":{"callsheet":{"notes":5}},"rows":[]}','call-sheet nested text'),
 ('{"meta":{"wx":{"maxC":"hot"}},"rows":[]}','weather nested value'),
 ('{"meta":{"wx":{"unknown":1}},"rows":[]}','unknown weather field'),
 ('{"meta":{"unknown":1},"rows":[]}','unknown metadata field'),
 ('{"meta":{},"rows":[],"savedAt":-1}','negative legacy timestamp')
) invalid(doc,label);
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,jsonb_build_object('meta','{}'::jsonb,'rows',(select jsonb_agg('{}'::jsonb) from generate_series(1,5001))),1)$$,'PT400','Invalid schedule document','bounded row count');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,jsonb_build_object('meta',jsonb_build_object('prod',repeat('x',2100000)),'rows','[]'::jsonb),1)$$,'PT400','Invalid schedule document','bounded complete document size');
select extensions.is((select document_version from public.schedules where id='66000000-0000-4000-a000-000000000001'),2::bigint,'all failed writes leave current version unchanged');
select extensions.is((select count(*) from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000001'),2::bigint,'all failed writes leave history unchanged');

-- Inject a history-write failure and prove the schedule UPDATE rolls back with it.
set local role postgres;
create function private.test_history_failure() returns trigger language plpgsql as $$begin raise exception 'Synthetic history failure'; end;$$;
create trigger test_history_failure before insert on public.schedule_versions for each row execute function private.test_history_failure();
set local role authenticated;
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,'{"meta":{"town":"Not committed"},"rows":[]}',1)$$,'P0001','Synthetic history failure','history failure aborts entire mutation');
select extensions.is((select town from public.schedules where id='66000000-0000-4000-a000-000000000001'),'Updated town','row content rolls back after history failure');
select extensions.is((select document_version from public.schedules where id='66000000-0000-4000-a000-000000000001'),2::bigint,'version rolls back after history failure');
select extensions.is((select count(*) from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000001'),2::bigint,'history remains intact after injected failure');
set local role postgres;
drop trigger test_history_failure on public.schedule_versions;
drop function private.test_history_failure();

-- Deleted parents hide both the RPC and direct table/history paths.
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated","aal":"aal2"}',true);
update public.production_days set deleted_at=now() where id='65000000-0000-4000-a000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000001')$$,'PT404','Schedule unavailable','deleted day read denied');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,'{"meta":{},"rows":[]}',1)$$,'PT404','Schedule unavailable','deleted day update denied');
select extensions.is((select count(*) from public.schedules),0::bigint,'direct RLS read also hides deleted-parent schedule');
select extensions.is((select count(*) from public.schedule_versions),0::bigint,'history RLS follows deleted-parent restriction');
set local role postgres;
-- Trusted fixture administration uses an owner identity for deletion triggers.
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated","aal":"aal2"}',true);
update public.production_days set deleted_at=null where id='65000000-0000-4000-a000-000000000001';
update public.phases set deleted_at=now() where id='64000000-0000-4000-a000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.read_schedule('66000000-0000-4000-a000-000000000001')$$,'PT404','Schedule unavailable','deleted phase read denied');
select extensions.throws_ok($$select public.update_schedule_document('66000000-0000-4000-a000-000000000001',2,'{"meta":{},"rows":[]}',1)$$,'PT404','Schedule unavailable','deleted phase update denied');
select * from extensions.finish();
rollback;

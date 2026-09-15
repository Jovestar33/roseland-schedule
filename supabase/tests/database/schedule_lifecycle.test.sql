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

select extensions.ok(not has_function_privilege('anon','public.mutate_schedule(uuid,bigint,text,jsonb)','EXECUTE'),'anonymous lifecycle denied');
select extensions.ok(not has_function_privilege('service_role','public.create_schedule(uuid,uuid,text,text,jsonb,integer)','EXECUTE'),'no service role create surface');
select extensions.ok(not has_function_privilege('authenticated','private.lock_schedule_scope(uuid,boolean)','EXECUTE'),'private lock helper not callable');
set local role authenticated; select set_config('request.jwt.claims','{}',true);
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT401',null,'create requires identity');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'archive','{}')$q$,'PT401',null,'mutation requires identity');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'viewer cannot create');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'rename','{}')$q$,'PT404',null,'viewer denied rename');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'archive','{}')$q$,'PT404',null,'viewer denied archive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'unarchive','{}')$q$,'PT404',null,'viewer denied unarchive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'delete','{}')$q$,'PT404',null,'viewer denied delete');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore','{}')$q$,'PT404',null,'viewer denied restore');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore_version','{}')$q$,'PT404',null,'viewer denied restore_version');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000004","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'other tenant cannot create');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'rename','{}')$q$,'PT404',null,'other tenant denied rename');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'archive','{}')$q$,'PT404',null,'other tenant denied archive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'unarchive','{}')$q$,'PT404',null,'other tenant denied unarchive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'delete','{}')$q$,'PT404',null,'other tenant denied delete');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore','{}')$q$,'PT404',null,'other tenant denied restore');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore_version','{}')$q$,'PT404',null,'other tenant denied restore_version');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000005","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'suspended member cannot create');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'rename','{}')$q$,'PT404',null,'suspended member denied rename');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'archive','{}')$q$,'PT404',null,'suspended member denied archive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'unarchive','{}')$q$,'PT404',null,'suspended member denied unarchive');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'delete','{}')$q$,'PT404',null,'suspended member denied delete');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore','{}')$q$,'PT404',null,'suspended member denied restore');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore_version','{}')$q$,'PT404',null,'suspended member denied restore_version');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'delete','{}')$q$,'PT404',null,'editor cannot soft delete');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000001',1,'restore','{}')$q$,'PT404',null,'editor cannot undelete');
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000002','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'cross tenant day substitution rejected');
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{},"rows":[{"dur":"00:99"}]}',1)$q$,'PT400',null,'create validates nested document');
select extensions.lives_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'editor creates version one with verified parent');
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000003','65000000-0000-4000-a000-000000000001','Created','created','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT409',null,'retry is create-only and cannot duplicate ID or slug');
select extensions.is((public.read_schedule('66000000-0000-4000-a000-000000000003')->>'document_version')::bigint,1::bigint,'create starts at version one');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',null,'archive','{}')$q$,'PT400',null,'unsafe version null');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',0,'archive','{}')$q$,'PT400',null,'unsafe version 0');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',9007199254740991,'archive','{}')$q$,'PT400',null,'unsafe version 9007199254740991');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'rename','{"display_name":"X","slug":"x","organization_id":"changed"}')$q$,'PT400',null,'unknown metadata rejected');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'rename','{"display_name":" ","slug":"x"}')$q$,'PT400',null,'blank name rejected');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'rename','{"display_name":"X","slug":"../x"}')$q$,'PT400',null,'unsafe slug rejected');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'archive','{"status":"published"}')$q$,'PT400',null,'archive cannot smuggle fields');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'move','{}')$q$,'PT400',null,'move unsupported');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'restore_version','{"version":1.5}')$q$,'PT400',null,'fractional history version rejected');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'rename','{"display_name":"Renamed","slug":"renamed"}')$q$,'rename keeps stable ID');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',1,'archive','{}')$q$,'PT409',null,'stale lifecycle conflicts');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',2,'archive','{}')$q$,'editor archives');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->>'archived_from_status','draft','archive saves previous status');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',3,'archive','{}')$q$,'PT409',null,'duplicate archive transition rejected');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',3,'unarchive','{}')$q$,'editor restores prior status');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->>'status','draft','unarchive restores exact previous status');
select extensions.lives_ok($q$select public.update_schedule_document('66000000-0000-4000-a000-000000000003',4,'{"meta":{"town":"Changed"},"rows":[]}',1)$q$,'edit before restoring history');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',5,'restore_version','{"version":1}')$q$,'editor restores document as new version');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->'document'->'meta'->>'town','Origin','old document restored');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->>'display_name','Renamed','version restore preserves current name');
select extensions.is((select count(*) from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000003'),6::bigint,'history remains append only');
select extensions.ok((select metadata->>'slug'='renamed' and metadata_checksum=encode(extensions.digest(convert_to(metadata::text,'UTF8'),'sha256'),'hex') from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000003' and version=6),'metadata history and checksum match');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',6,'restore_version','{"version":999}')$q$,'PT404',null,'absent history unavailable');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',6,'delete','{}')$q$,'admin soft deletes');
select extensions.throws_ok($q$select public.read_schedule('66000000-0000-4000-a000-000000000003')$q$,'PT404',null,'deleted schedule hidden from normal read');
select extensions.is((public.read_deleted_schedule('66000000-0000-4000-a000-000000000003')->>'document_version')::bigint,7::bigint,'admin can obtain deleted version for safe recovery');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.read_deleted_schedule('66000000-0000-4000-a000-000000000003')$q$,'PT404',null,'editor cannot inspect deleted schedule');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',7,'restore','{}')$q$,'PT404',null,'editor cannot recover deleted schedule');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000004','65000000-0000-4000-a000-000000000001','Created','renamed','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'new schedule may use deleted slug');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',7,'restore','{}')$q$,'PT409',null,'slug reuse blocks recovery without clobbering');
select extensions.is((public.read_deleted_schedule('66000000-0000-4000-a000-000000000003')->>'document_version')::bigint,7::bigint,'failed restore leaves deleted version intact');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000004',1,'rename','{"display_name":"Replacement","slug":"replacement"}')$q$,'resolve slug explicitly');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',7,'restore','{}')$q$,'admin restores original ID and document');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->'document'->'meta'->>'town','Origin','undelete preserves document');
set local role postgres;
create temporary table before_failure as select to_jsonb(s) snapshot from public.schedules s where id='66000000-0000-4000-a000-000000000003';
create function private.lifecycle_fail_history() returns trigger language plpgsql as $$begin if new.schedule_id='66000000-0000-4000-a000-000000000003'::uuid then raise exception 'fixture history failure'; end if; return new; end;$$;
create trigger lifecycle_fail_history before insert on public.schedule_versions for each row execute function private.lifecycle_fail_history();
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',8,'archive','{}')$q$,'P0001',null,'history failure aborts lifecycle');
set local role postgres; drop trigger lifecycle_fail_history on public.schedule_versions;
select extensions.ok((select to_jsonb(s)=(select snapshot from before_failure) from public.schedules s where id='66000000-0000-4000-a000-000000000003'),'history failure leaves entire row unchanged');
create function private.lifecycle_fail_audit() returns trigger language plpgsql as $$begin if new.resource_id='66000000-0000-4000-a000-000000000003'::uuid then raise exception 'fixture audit failure'; end if; return new; end;$$;
create trigger lifecycle_fail_audit before insert on public.audit_events for each row execute function private.lifecycle_fail_audit();
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',8,'archive','{}')$q$,'P0001',null,'audit failure rolls back history and row');
set local role postgres; drop trigger lifecycle_fail_audit on public.audit_events;
select extensions.ok((select to_jsonb(s)=(select snapshot from before_failure) from public.schedules s where id='66000000-0000-4000-a000-000000000003'),'audit failure leaves entire row unchanged');
select extensions.is((select count(*) from public.schedule_versions where schedule_id='66000000-0000-4000-a000-000000000003'),8::bigint,'failed operations append no history');
select extensions.is((select count(*) from public.audit_events where resource_id='66000000-0000-4000-a000-000000000003'),7::bigint,'successful lifecycle operations audited exactly once');
delete from public.production_memberships where user_id='61000000-0000-4000-a000-000000000002' and production_id='63000000-0000-4000-a000-000000000001';
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000005','65000000-0000-4000-a000-000000000001','Created','removed','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'removed production membership denies create');
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',8,'archive','{}')$q$,'PT404',null,'removed production membership denies mutation');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',8,'delete','{}')$q$,'delete before inactive-parent recovery test');
set local role postgres; update public.phases set deleted_at=now() where id='64000000-0000-4000-a000-000000000001';
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',9,'restore','{}')$q$,'PT404',null,'inactive phase blocks restore');
select extensions.throws_ok($q$select public.create_schedule('66000000-0000-4000-a000-000000000005','65000000-0000-4000-a000-000000000001','Created','inactive','{"meta":{"town":"Origin"},"rows":[]}',1)$q$,'PT404',null,'inactive phase blocks create');
set local role postgres; update public.phases set deleted_at=null where id='64000000-0000-4000-a000-000000000001';
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',9,'restore','{}')$q$,'restore succeeds after explicit parent recovery');
set local role postgres; update public.schedules set status='published' where id='66000000-0000-4000-a000-000000000003';
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',11,'archive','{}')$q$,'PT404',null,'removed member still denied after recovery');
set local role authenticated; select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',11,'archive','{}')$q$,'archive a published schedule');
select extensions.lives_ok($q$select public.mutate_schedule('66000000-0000-4000-a000-000000000003',12,'unarchive','{}')$q$,'unarchive a published schedule');
select extensions.is(public.read_schedule('66000000-0000-4000-a000-000000000003')->>'status','published','unarchive preserves published status');
select * from extensions.finish(); rollback;

-- ONLY the isolated backup rehearsal database. All fixtures roll back.
\set ON_ERROR_STOP on
begin;
insert into public.productions(id,organization_id,name,slug)values('10000000-0000-4000-8000-000000000010','820f7fc4-e364-4aae-a29a-65f7d84eef61','Isolated sync rehearsal','isolated-sync-rehearsal');
insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by)values('10000000-0000-4000-8000-000000000011','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000010','Fictional rehearsal','fictional-rehearsal','{"meta":{},"rows":[]}','71280ab3-541c-4e7f-95f3-f646ac2d701b','71280ab3-541c-4e7f-95f3-f646ac2d701b');
insert into private.trial_sync_integrations(id,organization_id,netlify_site_id,legacy_origin,enabled,authorized_by,authorized_at)values('10000000-0000-4000-8000-000000000012','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000013','https://fictional-rehearsal.netlify.app',true,'71280ab3-541c-4e7f-95f3-f646ac2d701b',now());
insert into private.trial_sync_mappings(id,integration_id,schedule_id,legacy_key)values('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000011','fictional-rehearsal');

create function pg_temp.expect_error(statement text,wanted text) returns void language plpgsql as $$
begin
 begin execute statement;exception when others then
  if sqlstate=wanted then return;end if;
  raise exception 'Expected %, got %: %',wanted,sqlstate,sqlerrm;
 end;
 raise exception 'Expected failure % but statement succeeded',wanted;
end;$$;

insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by)values('10000000-0000-4000-8000-000000000017','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000010','Unmapped rehearsal','unmapped-rehearsal','{"meta":{},"rows":[]}','71280ab3-541c-4e7f-95f3-f646ac2d701b','71280ab3-541c-4e7f-95f3-f646ac2d701b');
set local role authenticated;
select pg_temp.expect_error($q$select public.record_trial_sync_inventory('10000000-0000-4000-8000-000000000012','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000013','https://fictional-rehearsal.netlify.app',array['new-in-legacy'])$q$,'42501');
set local role service_role;
select pg_temp.expect_error($q$select public.record_trial_sync_inventory('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000099','10000000-0000-4000-8000-000000000013','https://fictional-rehearsal.netlify.app',array['new-in-legacy'])$q$,'PT409');
select pg_temp.expect_error($q$select public.record_trial_sync_inventory('10000000-0000-4000-8000-000000000012','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000013','https://fictional-rehearsal.netlify.app',array['duplicate','duplicate'])$q$,'PT400');
do $$begin
 if (public.record_trial_sync_inventory('10000000-0000-4000-8000-000000000012','820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000013','https://fictional-rehearsal.netlify.app',array['new-in-legacy'])->>'attention')::int<>3 then raise exception 'Inventory differences not detected';end if;
end;$$;
reset role;
do $$declare v jsonb;begin
 select inventory into v from private.trial_sync_integrations where id='10000000-0000-4000-8000-000000000012';
 if v->'legacy_unmapped'<>'["new-in-legacy"]'::jsonb or v->'legacy_missing'<>'["fictional-rehearsal"]'::jsonb or v->'target_unmapped'->0->>'id'<>'10000000-0000-4000-8000-000000000017' then raise exception 'Inventory attribution incorrect';end if;
end;$$;
set local role anon;
select pg_temp.expect_error($q$select public.claim_trial_sync_mapping('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000015')$q$,'42501');
set local role authenticated;
select pg_temp.expect_error($q$select public.claim_trial_sync_mapping('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000015')$q$,'42501');
set local role service_role;
select pg_temp.expect_error($q$select * from private.trial_sync_mappings$q$,'42501');
select pg_temp.expect_error($q$select public.set_trial_sync_enabled('10000000-0000-4000-8000-000000000012',1,true)$q$,'42501');
select public.claim_trial_sync_mapping('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000015')->>'state' as claim;
do $$begin
 if public.claim_trial_sync_mapping('10000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000016')->>'state'<>'idle' then raise exception 'Duplicate claim';end if;
end;$$;
select pg_temp.expect_error($q$select public.read_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000016')$q$,'PT409');
select public.checkpoint_trial_sync('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015',0,'{"status":"pending","pending":{"document":{"meta":{},"rows":[]}}}');
select pg_temp.expect_error($q$select public.checkpoint_trial_sync('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015',0,'{"status":"synced"}')$q$,'PT409');
select pg_temp.expect_error($q$select public.write_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015',0,'{"meta":{},"rows":[]}','{}')$q$,'PT409');
select public.write_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015',1,'{"meta":{"town":"Rehearsal"},"rows":[]}', '{"production":"10000000-0000-4000-8000-000000000010","day":null,"phase":null,"name":"Fictional rehearsal","slug":"fictional-rehearsal","status":"draft","position":0,"placement":{"projectName":null,"phase":null,"dayNumber":null,"totalDays":null}}')->>'document_version' as version;

reset role;
do $$declare s public.schedules;v public.schedule_versions;begin
 select * into s from public.schedules where id='10000000-0000-4000-8000-000000000011';
 select * into v from public.schedule_versions where schedule_id=s.id and version=2;
 if s.document_version<>2 or s.updated_by is not null or s.last_sync_integration_id<>'10000000-0000-4000-8000-000000000012' or v.created_by is not null or v.sync_integration_id is distinct from s.last_sync_integration_id then raise exception 'Incorrect machine attribution';end if;
 if exists(select 1 from private.trial_sync_writes) then raise exception 'Transaction receipt leaked';end if;
 if not exists(select 1 from public.audit_events where resource_id=s.id and action='trial_sync.document_received' and actor_user_id is null) then raise exception 'Missing audit';end if;
end;$$;
select pg_temp.expect_error($q$delete from private.trial_sync_checkpoints$q$,'P0001');
update private.trial_sync_mappings set lease_until=clock_timestamp()-interval '1 second';
set local role service_role;
select pg_temp.expect_error($q$select public.read_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015')$q$,'PT409');
reset role;
update private.trial_sync_mappings set lease_until=clock_timestamp()+interval '2 minutes';
update private.trial_sync_integrations set enabled=false;
set local role service_role;
select pg_temp.expect_error($q$select public.read_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015')$q$,'PT403');
reset role;
update private.trial_sync_integrations set enabled=true;
insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,denied_actions,authority,created_by)values('820f7fc4-e364-4aae-a29a-65f7d84eef61','10000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000011','everyone',array['export'],'owner','71280ab3-541c-4e7f-95f3-f646ac2d701b');
set local role service_role;
select pg_temp.expect_error($q$select public.read_trial_sync_schedule('10000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000015')$q$,'PT403');
reset role;
-- Human edits still clear machine attribution and increment history normally.
select set_config('request.jwt.claim.sub','71280ab3-541c-4e7f-95f3-f646ac2d701b',true);
-- Direct update is deliberately blocked by the existing user-session/MFA guard.
select pg_temp.expect_error($q$update public.schedules set document='{"meta":{},"rows":[]}' where id='10000000-0000-4000-8000-000000000011'$q$,'PT403');
rollback;
\echo 'Durable sync permission, lease, checkpoint, version, audit, pause and restriction checks passed (rolled back).'

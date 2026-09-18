-- Session-only trusted importer. Functions vanish with the SQL connection.
create function pg_temp.capture_state(org uuid) returns jsonb language plpgsql as $$
declare result jsonb:='{}';name text;rows jsonb;begin
 for name in select 'public.organizations' union select table_schema||'.'||table_name from information_schema.columns where table_schema in ('public','private') and column_name='organization_id' and table_name<>'migration_capture_runs' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]'') from %s x where %s=$1',name,case when name='public.organizations' then 'id' else 'organization_id' end)into rows using org;
  result:=result||jsonb_build_object(name,rows);
 end loop;
 select coalesce(jsonb_agg(to_jsonb(x) order by source_record_id),'[]') into rows from private.schedule_snapshot_imports x join private.schedule_snapshots s on s.id=x.snapshot_id where s.organization_id=org;
 result:=result||jsonb_build_object('private.schedule_snapshot_imports',rows);
 select coalesce(jsonb_agg(to_jsonb(x) order by template_id),'[]') into rows from private.schedule_template_browser_origins x join private.schedule_templates t on t.id=x.template_id where t.organization_id=org;
 result:=result||jsonb_build_object('private.schedule_template_browser_origins',rows);
 foreach name in array array['private.schedule_template_bindings','private.schedule_template_save_receipts']loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x)order by to_jsonb(x)::text),''[]'')from %s x join public.schedules s on s.id=x.schedule_id where s.organization_id=$1',name)into rows using org;
  result:=result||jsonb_build_object(name,rows);
 end loop;
 return result;
end;$$;
create function pg_temp.import_capture(p jsonb,fail_at text default null)returns jsonb language plpgsql as $$
declare org uuid:=(p->>'org')::uuid;actor uuid:=(p->>'actor')::uuid;env text:=p->>'environment';epoch bigint:=(p->>'epoch')::bigint;
 previous private.migration_capture_runs;r jsonb;old private.migration_records;outcome jsonb;run_id uuid:=gen_random_uuid();state jsonb;fingerprint text;source private.schedule_snapshots;
begin
 perform private.require_organization_writable(org);
 -- Trusted SQL import attribution only; application verification uses genuine Auth.
 perform set_config('request.jwt.claim.sub',actor::text,true);
 select * into previous from private.migration_capture_runs where organization_id=org and source_environment=env order by source_epoch desc limit 1;
 if previous.id is not null then
  if previous.target_state is distinct from pg_temp.capture_state(org) then raise exception 'Newer or changed target state; explicit reconciliation required';end if;
  if epoch=previous.source_epoch and previous.capture_hash=p->'capture'->>'sha256' then return jsonb_build_object('status','already_imported','run',previous.id);end if;
  if (p->>'previous_hash') is distinct from previous.capture_hash then raise exception 'Capture parent changed';end if;
  if epoch<=previous.source_epoch then raise exception 'Stale or conflicting source boundary';end if;
 else
  if p->>'previous_hash' is not null or exists(select 1 from public.schedules where organization_id=org) or exists(select 1 from private.migration_records where organization_id=org) then raise exception 'Fresh synthetic destination required';end if;
 end if;
 perform private.validate_organization_presentation(p->'presentation');
 for r in select value from jsonb_array_elements(p->'schedules')loop perform private.validate_schedule_document(r->'document',1);end loop;
 for r in select value from jsonb_array_elements(p->'templates')loop perform private.validate_schedule_document(jsonb_build_object('meta','{}'::jsonb,'rows',r->'rows'),1);end loop;
 for r in select value from jsonb_array_elements(p->'related'->'documents')loop perform private.validate_schedule_document(r,1);end loop;
 for r in select value from jsonb_array_elements(p->'productions')loop
  insert into public.productions(id,organization_id,name,slug,created_by,updated_by)values((r->>'id')::uuid,org,r->>'name',r->>'slug',actor,actor)
  on conflict(id)do update set name=excluded.name,slug=excluded.slug where (productions.name,productions.slug)is distinct from(excluded.name,excluded.slug);
 end loop;
 for r in select value from jsonb_array_elements(p->'phases')loop
  insert into public.phases(id,organization_id,production_id,name,position,created_by,updated_by)values((r->>'id')::uuid,org,(r->>'production_id')::uuid,r->>'name',(r->>'position')::int,actor,actor)
  on conflict(id)do update set name=excluded.name,position=excluded.position where(phases.name,phases.position)is distinct from(excluded.name,excluded.position);
 end loop;
 for r in select value from jsonb_array_elements(p->'schedules')loop
  insert into public.schedules(id,organization_id,production_id,phase_id,display_name,slug,document,document_schema_version,status,archived_from_status,library_position,town,created_by,updated_by)
  values((r->>'id')::uuid,org,(r->>'production_id')::uuid,(r->>'phase_id')::uuid,r->>'name',r->>'slug',r->'document',1,r->>'status',case when r->>'status'='archived' then 'draft' else null end,(r->>'position')::int,r->'document'->'meta'->>'town',actor,actor)
  on conflict(id)do update set display_name=excluded.display_name,slug=excluded.slug,document=excluded.document,status=excluded.status,archived_from_status=excluded.archived_from_status,library_position=excluded.library_position,town=excluded.town
  where(schedules.display_name,schedules.slug,schedules.document,schedules.status,schedules.library_position)is distinct from(excluded.display_name,excluded.slug,excluded.document,excluded.status,excluded.library_position);
 end loop;
 -- Lifecycle insertion/unarchive intentionally appends to a group. Apply the
 -- reviewed manual order after those transitions, without disabling triggers.
 for r in select value from jsonb_array_elements(p->'schedules')loop
  update public.schedules set library_position=(r->>'position')::int where id=(r->>'id')::uuid and library_position<>(r->>'position')::int;
 end loop;
 if fail_at='after_schedules' then raise exception 'Injected partial import failure';end if;
 -- Unlisted removal never becomes an implicit delete. Preserve the prior bytes.
 for old in select * from private.migration_records where organization_id=org and source_environment=env and not tombstone and not exists(select 1 from jsonb_array_elements(p->'related'->'records')x where x->>'id'=migration_records.id::text)loop
  if not ((p->'reviewed_removals') ? old.id::text) then raise exception 'Unreviewed source disappearance';end if;
  perform private.import_related_record(org,env,old.source_store,old.source_key,old.source_item,old.id,greatest(epoch,old.source_revision+1),old.payload,old.schedule_refs,true,old.version,old.fingerprint,run_id);
 end loop;
 for r in select value from jsonb_array_elements(p->'related'->'records')loop
  select * into old from private.migration_records where id=(r->>'id')::uuid;
  perform private.import_related_record(org,env,r->>'store',r->>'key',r->>'item',(r->>'id')::uuid,(r->>'revision')::bigint,r->'payload',r->'refs',false,coalesce(old.version,0),old.fingerprint,run_id);
 end loop;
 -- Unchanged snapshot bytes may receive a newer collection revision. Refresh
 -- only the catalogue binding; changed historical contents require review.
 for old in select * from private.migration_records where organization_id=org and source_environment=env and source_store='schedule-snapshots' and source_item<>'' and not tombstone loop
  select * into source from private.schedule_snapshots where id=old.id;
  if found then
   if source.original_payload is distinct from old.payload then raise exception 'Changed imported snapshot content needs explicit review';end if;
   update private.schedule_snapshot_imports set fingerprint=old.fingerprint where source_record_id=old.id;
  end if;
 end loop;
 for old in select * from private.migration_records where organization_id=org and source_environment=env and source_store='schedule-snapshots' and source_item='' and not tombstone loop
  perform private.materialize_snapshot_collection(old.id);
 end loop;
 for r in select value from jsonb_array_elements(p->'templates')loop
  insert into private.schedule_templates(id,organization_id,production_id,name,rows,created_by,updated_by)values((r->>'id')::uuid,org,(r->>'production_id')::uuid,r->>'name',r->'rows',actor,actor)
  on conflict(id)do update set name=excluded.name,rows=excluded.rows,version=schedule_templates.version+1,updated_by=actor,updated_at=clock_timestamp() where(schedule_templates.name,schedule_templates.rows)is distinct from(excluded.name,excluded.rows);
  if r->>'source' is not null then
   insert into private.schedule_template_sources(template_id,organization_id,schedule_id)values((r->>'id')::uuid,org,(r->>'source')::uuid)on conflict do nothing;
  else
   insert into private.schedule_template_browser_origins(template_id,actor_id,source_name,source_saved_at,source_fingerprint)values((r->>'id')::uuid,actor,r->'origin'->>'name',(r->'origin'->>'savedAt')::bigint,r->'origin'->>'fingerprint')
   on conflict(template_id)do update set source_saved_at=excluded.source_saved_at,source_fingerprint=excluded.source_fingerprint;
  end if;
 end loop;
 insert into private.organization_presentation(organization_id,version,config,updated_by)values(org,1,p->'presentation',actor)
 on conflict(organization_id)do update set version=organization_presentation.version+1,config=excluded.config,updated_by=actor,updated_at=clock_timestamp()where organization_presentation.config is distinct from excluded.config;
 for r in select value from jsonb_array_elements(p->'aliases')loop
  insert into private.schedule_client_aliases(id,legacy_name,organization_id,schedule_id,creator_id)values((r->>'id')::uuid,r->>'name',org,(r->>'schedule_id')::uuid,actor)on conflict(id)do nothing;
  if not exists(select 1 from private.schedule_client_aliases a where a.id=(r->>'id')::uuid and a.legacy_name=r->>'name' and a.organization_id=org and a.schedule_id=(r->>'schedule_id')::uuid and a.creator_id=actor and a.revoked_at is null)then raise exception 'Alias mapping changed or was revoked';end if;
 end loop;
 if fail_at='after_projections' then raise exception 'Injected projection failure';end if;
 state:=pg_temp.capture_state(org);
 insert into private.migration_capture_runs(id,organization_id,source_environment,source_epoch,capture_hash,capture,target_state)values(run_id,org,env,epoch,p->'capture'->>'sha256',p->'capture',state);
 return jsonb_build_object('status','imported','run',run_id,'epoch',epoch,'capture_sha256',p->'capture'->>'sha256');
end;$$;

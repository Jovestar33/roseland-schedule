-- Trusted, create-only importer. Loaded into one postgres session, never an API RPC.
-- Does not forge an Auth identity, disable triggers/RLS, or enable synchronization.
create function pg_temp.import_live_trial(p jsonb, fail_at text default null) returns jsonb
language plpgsql set search_path='' as $$
declare org uuid:=(p->>'organization_id')::uuid; actor uuid:=(p->>'owner_id')::uuid;
 run uuid:=(p->>'run_id')::uuid; integration uuid:=(p->>'integration_id')::uuid;
 r jsonb; s public.schedules; prior private.live_trial_imports; raw bytea; mapping uuid;
 guard jsonb; state jsonb; n integer:=0; projected integer:=0;
begin
 if session_user<>'postgres' or auth.uid() is not null then raise exception 'Trusted non-Auth database session required';end if;
 if p->>'format'<>'roseland.live-trial-import.v1'
 or org<>'820f7fc4-e364-4aae-a29a-65f7d84eef61'::uuid
 or actor<>'71280ab3-541c-4e7f-95f3-f646ac2d701b'::uuid
 or p->>'site_id'<>'53a070b7-1da9-4a24-a2d8-6560a013d427'
 or p->>'origin'<>'https://roselandschedule.netlify.app' then raise exception 'Import destination mismatch';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 perform pg_advisory_xact_lock(hashtextextended('live-trial-import:'||org::text,0));
 perform 1 from public.organizations where id=org and name='Roseland Pictures' and deleted_at is null for update;
 if not found or not private.organization_writable(org) or not private.organization_lifecycle_owner(actor,org) then raise exception 'Original organization/Owner unavailable';end if;
 select * into prior from private.live_trial_imports where organization_id=org and site_id=(p->>'site_id')::uuid;
 if found then
  if prior.capture_hash<>p->>'capture_hash' or prior.plan_hash<>p->>'sha256' then raise exception 'A different import already exists; reconcile instead of overwriting';end if;
  return jsonb_build_object('state','already_imported','run',prior.id,'writes',0);
 end if;
 -- This initial mirror import must never overwrite newer target work.
 if exists(select 1 from public.schedules where organization_id=org)
 or exists(select 1 from public.productions where organization_id=org)
 or exists(select 1 from private.organization_presentation where organization_id=org)
 or exists(select 1 from private.trial_sync_integrations where organization_id=org) then raise exception 'Destination is not empty; explicit reconciliation required';end if;
 if jsonb_array_length(p->'schedules') not between 1 and 500 then raise exception 'Invalid schedule inventory';end if;
 perform private.validate_organization_presentation(p->'presentation');
 for r in select value from jsonb_array_elements(p->'schedules') loop perform private.validate_schedule_document(r->'document',1);end loop;
 for r in select value from jsonb_array_elements(p->'related') loop perform private.validate_schedule_document(r->'payload'->'data',1);end loop;
 for r in select value from jsonb_array_elements(p->'templates') loop perform private.validate_schedule_document(jsonb_build_object('meta','{}'::jsonb,'rows',r->'rows'),1);end loop;
 insert into private.live_trial_imports(id,organization_id,site_id,origin,capture_hash,plan_hash,authorized_by,manifest,decisions)
 values(run,org,(p->>'site_id')::uuid,p->>'origin',p->>'capture_hash',p->>'sha256',actor,p->'capture_manifest',p-array['objects','capture_manifest','related']);
 for r in select value from jsonb_array_elements(p->'objects') loop
  raw:=decode(r->>'raw_base64','base64');
  if octet_length(raw)<>(r->>'length')::integer then raise exception 'Original byte length mismatch';end if;
  insert into private.live_trial_source_objects(run_id,store,key,etag,sha256,metadata,raw_bytes)
   values(run,r->>'store',r->>'key',r->>'etag',r->>'sha256',coalesce(r->'metadata','{}'::jsonb),raw);n:=n+1;
 end loop;
 if n<>jsonb_array_length(p->'capture_manifest'->'entries') then raise exception 'Incomplete original archive';end if;
 for r in select value from jsonb_array_elements(p->'productions') loop
  insert into public.productions(id,organization_id,name,slug,status,timezone,created_by,updated_by)
   values((r->>'id')::uuid,org,r->>'name',r->>'slug',(r->>'status')::public.production_status,'America/New_York',actor,actor);
 end loop;
 for r in select value from jsonb_array_elements(p->'phases') loop
  insert into public.phases(id,organization_id,production_id,name,position,created_by,updated_by)
   values((r->>'id')::uuid,org,(r->>'production_id')::uuid,r->>'name',(r->>'position')::integer,actor,actor);
 end loop;
 for r in select value from jsonb_array_elements(p->'days') loop
  insert into public.production_days(id,organization_id,production_id,phase_id,calendar_date,day_type,position,status,created_by,updated_by)
   values((r->>'id')::uuid,org,(r->>'production_id')::uuid,(r->>'phase_id')::uuid,(r->>'date')::date,r->>'type',(r->>'position')::integer,r->>'status',actor,actor);
 end loop;
 for r in select value from jsonb_array_elements(p->'schedules') loop
  insert into public.schedules(id,organization_id,production_id,production_day_id,phase_id,display_name,slug,document,document_schema_version,status,archived_from_status,library_position,town,created_by,updated_by)
   values((r->>'id')::uuid,org,(r->>'production_id')::uuid,(r->>'day_id')::uuid,(r->>'phase_id')::uuid,r->>'name',r->>'slug',r->'document',1,r->>'status',case when r->>'status'='archived' then 'draft' else null end,(r->>'position')::integer,r->'document'->'meta'->>'town',actor,actor);
 end loop;
 if fail_at='after_schedules' then raise exception 'Injected rollback test';end if;
 for r in select value from jsonb_array_elements(p->'related') loop
  insert into private.schedule_snapshots(id,organization_id,schedule_id,name,kind,document,captured_at,original_id,original_order,original_payload)
   values((r->>'id')::uuid,org,(r->>'schedule_id')::uuid,r->'payload'->>'label','imported',r->'payload'->'data',to_timestamp((r->'payload'->>'savedAt')::numeric/1000),r->'payload'->>'id',(r->>'original_order')::integer,r->'payload');projected:=projected+1;
 end loop;
 for r in select value from jsonb_array_elements(p->'templates') loop
  insert into private.schedule_templates(id,organization_id,production_id,name,rows,created_by,updated_by)
   values((r->>'id')::uuid,org,(r->>'production_id')::uuid,r->>'name',r->'rows',actor,actor);
  insert into private.schedule_template_legacy_origins(template_id,organization_id,run_id,source_key,source_name)
   values((r->>'id')::uuid,org,run,r->>'source_key',r->>'source_name');
 end loop;
 insert into private.organization_presentation(organization_id,version,config,updated_by)values(org,1,p->'presentation',actor);
 insert into private.trial_sync_integrations(id,organization_id,netlify_site_id,legacy_origin,enabled)
  values(integration,org,(p->>'site_id')::uuid,p->>'origin',false);
 for r in select value from jsonb_array_elements(p->'schedules') loop
  select * into s from public.schedules where id=(r->>'id')::uuid and organization_id=org;
  if s.document is distinct from r->'document' or s.display_name<>r->>'name' or s.slug<>r->>'slug'
   or s.production_id is distinct from (r->>'production_id')::uuid or s.phase_id is distinct from (r->>'phase_id')::uuid
   or s.production_day_id is distinct from (r->>'day_id')::uuid or s.status<>r->>'status'
   or s.library_position<>(r->>'position')::integer then raise exception 'Imported schedule readback mismatch';end if;
  guard:=jsonb_build_object('production',s.production_id,'day',s.production_day_id,'phase',s.phase_id,'name',s.display_name,'slug',s.slug,'status',s.status,'position',s.library_position,'placement',r->'netlify_guard'->'placement');
  state:=jsonb_build_object('base',s.document-'savedAt','guards',jsonb_build_object('netlify',r->'netlify_guard','supabase',guard),'pending',null,'status','imported-awaiting-live-check');
  insert into private.trial_sync_mappings(integration_id,schedule_id,legacy_key,state)values(integration,s.id,r->>'key',state) returning id into mapping;
  insert into private.trial_sync_checkpoints(mapping_id,sequence,state,checksum)values(mapping,0,state,encode(extensions.digest(convert_to(state::text,'UTF8'),'sha256'),'hex'));
 end loop;
 if fail_at='after_mappings' then raise exception 'Injected rollback test';end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,null,'trial_import.completed','trial_import',run,jsonb_build_object('authorized_by',actor,'capture_hash',p->>'capture_hash','schedules',jsonb_array_length(p->'schedules'),'source_objects',n,'snapshots',projected,'sync_enabled',false));
 return jsonb_build_object('state','imported','run',run,'schedules',jsonb_array_length(p->'schedules'),'snapshots',projected,'objects',n,'sync_enabled',false);
end;$$;

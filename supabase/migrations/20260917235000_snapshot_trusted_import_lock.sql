-- Correct the private trusted-import locking contract; public Auth checks are unchanged.
create or replace function private.materialize_snapshot_collection(collection_id uuid)
returns integer language plpgsql set search_path='' as $$
declare c private.migration_records; leaf private.migration_records; item record; s public.schedules; existing private.schedule_snapshot_imports; n integer:=0; bindings jsonb;
begin
 if session_user<>'postgres' then raise sqlstate '42501' using message='Trusted database importer required'; end if;
 select * into c from private.migration_records where id=collection_id for share;
 if not found or c.source_store<>'schedule-snapshots' or c.source_item<>'' or c.tombstone or jsonb_typeof(c.payload->'snapshots') is distinct from 'array' then raise exception 'Snapshot collection unavailable'; end if;
 -- This invoker-only importer has no application session. Keep the same policy
 -- serialization and organization lock without calling the user-session guard.
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||c.organization_id::text,0));
 perform 1 from public.organizations where id=c.organization_id and deleted_at is null for share;
 if not found then raise exception 'Import organization unavailable'; end if;
 select * into s from public.schedules where id=(c.schedule_refs->>(c.payload->>'name'))::uuid and organization_id=c.organization_id for share;
 if not found then raise exception 'Snapshot source unresolved'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.template_id,'fingerprint',b.fingerprint,'contexts',b.contexts)),'[]') into bindings from private.schedule_template_bindings b where b.schedule_id=s.id;
 for item in select value,ordinality from jsonb_array_elements(c.payload->'snapshots') with ordinality loop
  select * into leaf from private.migration_records where organization_id=c.organization_id and source_environment=c.source_environment and source_store=c.source_store and source_key=c.source_key and source_item=item.value->>'id' for share;
  if not found or leaf.tombstone or leaf.payload<>item.value or leaf.schedule_refs<>c.schedule_refs or jsonb_typeof(item.value->'label') is distinct from 'string' or jsonb_typeof(item.value->'savedAt') is distinct from 'number' then raise exception 'Snapshot leaf does not match collection'; end if;
  perform private.validate_schedule_document(leaf.payload->'data',1);
  select * into existing from private.schedule_snapshot_imports where source_record_id=leaf.id;
  if found then
   if existing.fingerprint<>leaf.fingerprint then raise exception 'Imported snapshot changed; explicit migration review required'; end if;
   continue;
  end if;
  insert into private.schedule_snapshots(id,organization_id,schedule_id,name,kind,document,template_bindings,captured_at,original_id,original_order,original_payload)
   values(leaf.id,c.organization_id,s.id,leaf.payload->>'label','imported',leaf.payload->'data',bindings,to_timestamp((leaf.payload->>'savedAt')::numeric/1000),leaf.source_item,item.ordinality,leaf.payload);
  insert into private.schedule_snapshot_imports values(leaf.id,leaf.id,leaf.fingerprint);
  n:=n+1;
 end loop;
 return n;
end;$$;

revoke all on function private.materialize_snapshot_collection(uuid) from public,anon,authenticated,service_role;

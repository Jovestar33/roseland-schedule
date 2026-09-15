-- Local migration slice: recoverable, versioned schedule lifecycle. No purge or move.
alter table public.schedules add column archived_from_status text
  check (archived_from_status in ('draft','published'));
alter table public.schedule_versions add column metadata jsonb
  check (metadata is null or jsonb_typeof(metadata) = 'object');
alter table public.schedule_versions add column metadata_checksum text
  check (metadata_checksum is null or metadata_checksum ~ '^[a-f0-9]{64}$');
-- Old immutable versions are deliberately not backfilled with invented metadata.
create or replace function public.record_schedule_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  snapshot := jsonb_build_object('display_name',new.display_name,'slug',new.slug,
    'production_day_id',new.production_day_id,'status',new.status,
    'archived_from_status',new.archived_from_status,'town',new.town,'deleted_at',new.deleted_at);
  insert into public.schedule_versions(organization_id,production_id,schedule_id,version,
    document_schema_version,document,checksum,created_by,metadata,metadata_checksum)
  values(new.organization_id,new.production_id,new.id,new.document_version,new.document_schema_version,
    new.document,encode(extensions.digest(convert_to(new.document::text,'UTF8'),'sha256'),'hex'),
    coalesce(new.updated_by,new.created_by),snapshot,
    encode(extensions.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'));
  return new;
end;
$$;

create function private.lock_schedule_scope(day_id uuid, admin_required boolean)
returns public.production_days language plpgsql security definer set search_path = '' as $$
declare d public.production_days; actor uuid := auth.uid();
begin
  if actor is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
  select * into d from public.production_days where id=day_id;
  if not found or not public.can_edit_production(d.production_id)
    or (admin_required and not public.is_org_admin(d.organization_id)) then
    raise sqlstate 'PT404' using message='Schedule unavailable';
  end if;
  -- Same lock order as document updates and permission lifecycle functions.
  perform 1 from public.organizations where id=d.organization_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  perform 1 from public.productions where id=d.production_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  perform 1 from public.organization_memberships where organization_id=d.organization_id and user_id=actor for share;
  perform 1 from public.production_memberships where production_id=d.production_id and user_id=actor for share;
  if not public.can_edit_production(d.production_id)
    or (admin_required and not public.is_org_admin(d.organization_id)) then
    raise sqlstate 'PT404' using message='Schedule unavailable';
  end if;
  select * into d from public.production_days where id=day_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  if d.phase_id is not null then
    perform 1 from public.phases where id=d.phase_id and deleted_at is null for share;
    if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  end if;
  return d;
end;
$$;

create function private.validate_schedule_name(schedule_name text, schedule_slug text)
returns void language plpgsql set search_path = '' as $$
begin
  if schedule_name is null or schedule_name <> btrim(schedule_name)
    or char_length(schedule_name) not between 1 and 160
    or schedule_slug is null or char_length(schedule_slug) not between 1 and 160
    or schedule_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise sqlstate 'PT400' using message='Invalid schedule name or slug';
  end if;
end;
$$;

create function public.create_schedule(target_schedule_id uuid, target_day_id uuid,
  next_display_name text, next_slug text, next_document jsonb, schema_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.production_days; saved public.schedules;
begin
  d := private.lock_schedule_scope(target_day_id,false);
  if target_schedule_id is null then raise sqlstate 'PT400' using message='Schedule ID is required'; end if;
  perform private.validate_schedule_name(next_display_name,next_slug);
  perform private.validate_schedule_document(next_document,schema_version);
  insert into public.schedules(id,organization_id,production_id,production_day_id,
    display_name,slug,document,document_schema_version,town,created_by,updated_by)
  values(target_schedule_id,d.organization_id,d.production_id,d.id,next_display_name,next_slug,
    next_document,schema_version,nullif(btrim(next_document->'meta'->>'town'),''),auth.uid(),auth.uid())
  returning * into saved;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(saved.organization_id,auth.uid(),'schedule.create','schedule',saved.id,jsonb_build_object('version',1));
  return to_jsonb(saved);
exception when unique_violation then
  raise sqlstate 'PT409' using message='Schedule identity or slug already exists';
end;
$$;

create function public.read_deleted_schedule(target_schedule_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
  select to_jsonb(s) into result from public.schedules s where s.id=target_schedule_id
    and s.deleted_at is not null and public.is_org_admin(s.organization_id);
  if result is null then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  return result;
end;
$$;

create function public.mutate_schedule(target_schedule_id uuid, expected_version bigint,
  operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_row public.schedules; saved public.schedules; d public.production_days;
  source public.schedule_versions; source_version bigint;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
  if expected_version is null or expected_version < 1 or expected_version >= 9007199254740991 then
    raise sqlstate 'PT400' using message='Expected version is required';
  end if;
  if operation is null or operation not in ('rename','archive','unarchive','delete','restore','restore_version')
    or payload is null or jsonb_typeof(payload) <> 'object' then
    raise sqlstate 'PT400' using message='Invalid lifecycle request';
  end if;
  select * into old_row from public.schedules where id=target_schedule_id;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  d := private.lock_schedule_scope(old_row.production_day_id,operation in ('delete','restore'));
  select * into old_row from public.schedules where id=target_schedule_id for update;
  if old_row.production_day_id <> d.id then
    raise sqlstate 'PT409' using message='Schedule changed; reload before saving';
  end if;
  if (operation='restore' and old_row.deleted_at is null)
    or (operation<>'restore' and old_row.deleted_at is not null) then
    raise sqlstate 'PT404' using message='Schedule unavailable';
  end if;
  if old_row.document_version <> expected_version then
    raise sqlstate 'PT409' using message='Schedule changed; reload before saving';
  end if;
  if operation='rename' then
    if (payload - array['display_name','slug']) <> '{}'::jsonb
      or jsonb_typeof(payload->'display_name') is distinct from 'string'
      or jsonb_typeof(payload->'slug') is distinct from 'string' then
      raise sqlstate 'PT400' using message='Invalid lifecycle request';
    end if;
    perform private.validate_schedule_name(payload->>'display_name',payload->>'slug');
    update public.schedules set display_name=payload->>'display_name',slug=payload->>'slug'
      where id=target_schedule_id returning * into saved;
  elsif operation='restore_version' then
    if (payload - 'version') <> '{}'::jsonb or jsonb_typeof(payload->'version') is distinct from 'number'
      or (payload->>'version')::numeric < 1 or (payload->>'version')::numeric >= 9007199254740991
      or (payload->>'version')::numeric <> trunc((payload->>'version')::numeric) then
      raise sqlstate 'PT400' using message='Invalid source version';
    end if;
    source_version := (payload->>'version')::bigint;
    select * into source from public.schedule_versions where schedule_id=target_schedule_id and version=source_version;
    if not found then raise sqlstate 'PT404' using message='Schedule version unavailable'; end if;
    perform private.validate_schedule_document(source.document,source.document_schema_version);
    -- Restore document only; preserve current identity, name, status and deletion state.
    update public.schedules set document=source.document,document_schema_version=source.document_schema_version,
      town=nullif(btrim(source.document->'meta'->>'town'),'') where id=target_schedule_id returning * into saved;
  else
    if payload <> '{}'::jsonb then raise sqlstate 'PT400' using message='Invalid lifecycle request'; end if;
    if (operation='archive' and old_row.status='archived')
      or (operation='unarchive' and (old_row.status<>'archived' or old_row.archived_from_status is null)) then
      raise sqlstate 'PT409' using message='Schedule status cannot make this transition';
    end if;
    update public.schedules set
      status=case operation when 'archive' then 'archived' when 'unarchive' then old_row.archived_from_status else status end,
      archived_from_status=case operation when 'archive' then old_row.status when 'unarchive' then null else archived_from_status end,
      deleted_at=case operation when 'delete' then clock_timestamp() when 'restore' then null else deleted_at end
      where id=target_schedule_id returning * into saved;
  end if;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(saved.organization_id,auth.uid(),'schedule.'||operation,'schedule',saved.id,
      jsonb_strip_nulls(jsonb_build_object('from_version',expected_version,'version',saved.document_version,'source_version',source_version)));
  return to_jsonb(saved);
exception when unique_violation then
  raise sqlstate 'PT409' using message='Schedule identity or slug already exists';
end;
$$;

revoke all on function private.lock_schedule_scope(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function private.validate_schedule_name(text,text) from public,anon,authenticated,service_role;
revoke all on function public.create_schedule(uuid,uuid,text,text,jsonb,integer) from public,anon,service_role;
revoke all on function public.read_deleted_schedule(uuid) from public,anon,service_role;
revoke all on function public.mutate_schedule(uuid,bigint,text,jsonb) from public,anon,service_role;
grant execute on function public.create_schedule(uuid,uuid,text,text,jsonb,integer) to authenticated;
grant execute on function public.read_deleted_schedule(uuid) to authenticated;
grant execute on function public.mutate_schedule(uuid,bigint,text,jsonb) to authenticated;

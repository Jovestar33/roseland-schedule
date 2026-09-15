-- Target-platform contract only. No editor/backend switch and no hosted application.
-- Keep the historical schema migrations immutable; close direct schedule-write bypasses.

create function private.validate_schedule_document(doc jsonb, schema_version integer)
returns void language plpgsql set search_path = '' as $$
declare
  item jsonb;
  nested jsonb;
  field record;
  meta jsonb;
  num numeric;
begin
  if schema_version is distinct from 1 or jsonb_typeof(doc) is distinct from 'object'
    or octet_length(doc::text) > 2097152
    or jsonb_typeof(doc->'meta') is distinct from 'object'
    or jsonb_typeof(doc->'rows') is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'Invalid schedule document';
  end if;
  if jsonb_array_length(doc->'rows') > 5000
    or exists (select 1 from jsonb_object_keys(doc) k where k not in ('meta','rows','savedAt')) then
    raise sqlstate 'PT400' using message = 'Invalid schedule document';
  end if;
  if doc ? 'savedAt' and (jsonb_typeof(doc->'savedAt') is distinct from 'number'
    or (doc->>'savedAt')::numeric < 0 or (doc->>'savedAt')::numeric > 9007199254740991) then
    raise sqlstate 'PT400' using message = 'Invalid schedule document';
  end if;
  meta := doc->'meta';
  for field in select * from jsonb_each(meta) loop
    if field.key = any(array['town','date','prod','dir','dp','projectName','phase']) then
      if jsonb_typeof(field.value) is distinct from 'string' or length(field.value #>> '{}') > 10000 then
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
    elsif field.key = any(array['lat','lng','dayNumber','totalDays']) then
      if field.value <> 'null'::jsonb then
        if jsonb_typeof(field.value) is distinct from 'number' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        num := (field.value #>> '{}')::numeric;
        if (field.key = 'lat' and abs(num) > 90) or (field.key = 'lng' and abs(num) > 180)
          or (field.key in ('dayNumber','totalDays') and (num < 1 or num > 1000000 or trunc(num) <> num)) then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
      end if;
    elsif field.key = 'wx' then
      if field.value <> 'null'::jsonb then
        if jsonb_typeof(field.value) is distinct from 'object' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        for item in select jsonb_build_object('key',key,'value',value) from jsonb_each(field.value) loop
          if item->>'key' = any(array['sunrise','sunset','cond','fetchedAt','town']) then
            if jsonb_typeof(item->'value') is distinct from 'string' or length(item->>'value') > 10000 then
              raise sqlstate 'PT400' using message = 'Invalid schedule document';
            end if;
          elsif item->>'key' = any(array['maxC','minC','maxF','minF','prec','code']) then
            if jsonb_typeof(item->'value') is distinct from 'number' or abs((item->>'value')::numeric) > 1000000 then
              raise sqlstate 'PT400' using message = 'Invalid schedule document';
            end if;
          elsif item->>'key' = 'noForecast' then
            if jsonb_typeof(item->'value') is distinct from 'boolean' then
              raise sqlstate 'PT400' using message = 'Invalid schedule document';
            end if;
          else
            raise sqlstate 'PT400' using message = 'Invalid schedule document';
          end if;
        end loop;
      end if;
    elsif field.key = 'callsheet' then
      if jsonb_typeof(field.value) is distinct from 'object' then
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
      for item in select jsonb_build_object('key',key,'value',value) from jsonb_each(field.value) loop
        if not (item->>'key' = any(array['basecamp','parking','hospital','emergency','mealNotes','safetyNotes','specialInstructions','notes']))
          or jsonb_typeof(item->'value') is distinct from 'string' or length(item->>'value') > 10000 then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
      end loop;
    else
      raise sqlstate 'PT400' using message = 'Invalid schedule document';
    end if;
  end loop;
  if length(btrim(meta->>'town')) > 160 then
    raise sqlstate 'PT400' using message = 'Invalid schedule document';
  end if;
  if coalesce(meta->>'date','') <> '' then
    if meta->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or to_char((meta->>'date')::date, 'YYYY-MM-DD') <> meta->>'date' then
      raise sqlstate 'PT400' using message = 'Invalid schedule document';
    end if;
  end if;
  for item in select value from jsonb_array_elements(doc->'rows') loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise sqlstate 'PT400' using message = 'Invalid schedule document';
    end if;
    for field in select * from jsonb_each(item) loop
      if field.key = any(array['action','otherText','desc','loc','locName','locAddress','notes','status','contactName','contactTitle','contactPhone','contactEmail','timeIn','dur','fixedOutTime']) then
        if jsonb_typeof(field.value) is distinct from 'string' or length(field.value #>> '{}') > 10000 then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        if field.key in ('timeIn','fixedOutTime') and field.value #>> '{}' <> ''
          and field.value #>> '{}' !~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        if field.key = 'dur' and field.value #>> '{}' <> '' and field.value #>> '{}' !~ '^[0-9]{1,3}:[0-5][0-9]$' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
      elsif field.key = any(array['done','sunLocked','fixedIn','fixedOut']) then
        if jsonb_typeof(field.value) is distinct from 'boolean' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
      elsif field.key in ('locLat','locLng') then
        if field.value <> 'null'::jsonb then
          if jsonb_typeof(field.value) is distinct from 'number' then
            raise sqlstate 'PT400' using message = 'Invalid schedule document';
          end if;
          if abs((field.value #>> '{}')::numeric) > (case when field.key = 'locLat' then 90 else 180 end) then
            raise sqlstate 'PT400' using message = 'Invalid schedule document';
          end if;
        end if;
      elsif field.key = 'subLocations' then
        if jsonb_typeof(field.value) is distinct from 'array' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        if jsonb_array_length(field.value) > 100 then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        for nested in select value from jsonb_array_elements(field.value) loop
          if jsonb_typeof(nested) is distinct from 'object' or jsonb_typeof(nested->'loc') is distinct from 'string'
            or exists(select 1 from jsonb_each(nested) e where
              case
                when e.key in ('id','loc','desc','name','address') then jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 10000
                when e.key = 'done' then jsonb_typeof(e.value) <> 'boolean'
                when e.key in ('locLat','locLng') then case when e.value = 'null'::jsonb then false
                  when jsonb_typeof(e.value) <> 'number' then true
                  else abs((e.value #>> '{}')::numeric) > case when e.key = 'locLat' then 90 else 180 end end
                else true
              end) then
            raise sqlstate 'PT400' using message = 'Invalid schedule document';
          end if;
        end loop;
      else
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
    end loop;
  end loop;
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  raise sqlstate 'PT400' using message = 'Invalid schedule document';
end;
$$;
revoke all on function private.validate_schedule_document(jsonb, integer) from public, anon, authenticated, service_role;

-- Hide documents/history under inactive days/phases even through direct RLS reads.
alter policy schedules_select_authorized on public.schedules using (
  public.can_access_production(production_id)
  and (deleted_at is null or public.is_org_admin(organization_id))
  and exists (
    select 1 from public.production_days d
    where d.id = schedules.production_day_id and d.deleted_at is null
      and (d.phase_id is null or exists(select 1 from public.phases p where p.id = d.phase_id and p.deleted_at is null))
  )
);

create function public.read_schedule(target_schedule_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'Authentication required'; end if;
  select to_jsonb(s) into result from public.schedules s
    where s.id = target_schedule_id and s.deleted_at is null;
  if result is null then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  return result;
end;
$$;

create function public.update_schedule_document(
  target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_schedule public.schedules;
  parent_day public.production_days;
  actor uuid := auth.uid();
  saved public.schedules;
begin
  if actor is null then raise sqlstate 'PT401' using message = 'Authentication required'; end if;
  if expected_version is null or expected_version < 1 or expected_version >= 9007199254740991 then
    raise sqlstate 'PT400' using message = 'Expected version is required';
  end if;
  -- Do not expose existence, document or version to unauthorized callers.
  select * into current_schedule from public.schedules s where s.id = target_schedule_id;
  if not found or current_schedule.deleted_at is not null
    or not public.can_edit_production(current_schedule.production_id) then
    raise sqlstate 'PT404' using message = 'Schedule unavailable';
  end if;
  -- Lock current authorization/parents against deletion and role changes. SHARE
  -- (not KEY SHARE) conflicts with non-key status/role updates. Order is consistent
  -- with invitation acceptance: organization, production, then memberships.
  perform 1 from public.organizations where id = current_schedule.organization_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  perform 1 from public.productions where id = current_schedule.production_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  perform 1 from public.organization_memberships where organization_id = current_schedule.organization_id and user_id = actor for share;
  perform 1 from public.production_memberships where production_id = current_schedule.production_id and user_id = actor for share;
  if not public.can_edit_production(current_schedule.production_id) then
    raise sqlstate 'PT404' using message = 'Schedule unavailable';
  end if;
  -- Lock the day before inspecting/locking its optional phase, so reparenting
  -- cannot change the phase being authorized beneath this transaction.
  select * into parent_day from public.production_days where id = current_schedule.production_day_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  if parent_day.phase_id is not null then
    perform 1 from public.phases where id = parent_day.phase_id and deleted_at is null for share;
    if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  end if;
  perform private.validate_schedule_document(next_document, schema_version);
  -- One conditional UPDATE serializes competing writers; the existing trigger
  -- increments the version, attributes the actor and inserts immutable history.
  -- History failure rolls back the update. No force/last-write-wins escape exists.
  update public.schedules s
    set document = next_document, document_schema_version = schema_version,
      town = nullif(btrim(next_document->'meta'->>'town'), '')
    where s.id = target_schedule_id and s.document_version = expected_version
      and s.deleted_at is null and s.production_day_id = current_schedule.production_day_id
    returning s.* into saved;
  if not found then raise sqlstate 'PT409' using message = 'Schedule changed; reload before saving'; end if;
  return to_jsonb(saved);
end;
$$;

-- Read/update is the only new surface in this slice. Creation, moves, renames,
-- archive/deletion and restore need separate versioned contracts before UI use.
revoke insert, update on table public.schedules from authenticated;
revoke all on function public.read_schedule(uuid) from public, anon, service_role;
revoke all on function public.update_schedule_document(uuid,bigint,jsonb,integer) from public, anon, service_role;
grant execute on function public.read_schedule(uuid) to authenticated;
grant execute on function public.update_schedule_document(uuid,bigint,jsonb,integer) to authenticated;

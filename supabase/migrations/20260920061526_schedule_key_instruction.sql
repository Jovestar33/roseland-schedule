-- Optional key instruction is schedule content, visible to authorized Client viewers.
-- Existing rows remain valid; no content is inferred or rewritten. Existing ACLs are preserved.

create or replace function private.validate_schedule_document(doc jsonb, schema_version integer)
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
      if field.key = any(array['action','otherText','desc','loc','locName','locAddress','notes','keyInstruction','status','contactName','contactTitle','contactPhone','contactEmail','timeIn','dur','fixedOutTime']) then
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


create or replace function private.client_projection(d jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('meta',private.client_pick(d->'meta','town date prod dir dp projectName phase dayNumber totalDays')||jsonb_build_object('wx',case when jsonb_typeof(d->'meta'->'wx')='object' then private.client_pick(d->'meta'->'wx','sunrise sunset maxF minF prec code cond fetchedAt noForecast') else 'null'::jsonb end),
 'rows',coalesce((select jsonb_agg(private.client_pick(r,'action otherText desc loc locLat locLng locName locAddress notes keyInstruction timeIn dur sunLocked fixedOut fixedOutTime')||case when jsonb_typeof(r->'subLocations')='array' then jsonb_build_object('subLocations',(select coalesce(jsonb_agg(private.client_pick(v,'id loc locLat locLng desc name address')),'[]')from jsonb_array_elements(r->'subLocations')v)) else '{}'::jsonb end order by n)from jsonb_array_elements(d->'rows')with ordinality x(r,n) where coalesce(r->>'action','')<>'' or coalesce(r->>'timeIn','')<>'' or coalesce(r->>'keyInstruction','')<>''),'[]'));
$$;

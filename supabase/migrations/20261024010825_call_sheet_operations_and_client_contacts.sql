-- Add optional Vercel production contacts and call-sheet logistics.
-- No source records are rewritten and the restricted Client projection is unchanged.
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
    elsif field.key = 'productionContacts' then
      if jsonb_typeof(field.value) is distinct from 'array' then
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
      if jsonb_array_length(field.value)>300 or
        (select count(*)<>count(distinct c->>'id') from jsonb_array_elements(field.value) c) then
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
      for nested in select value from jsonb_array_elements(field.value) loop
        if jsonb_typeof(nested) is distinct from 'object' then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
        if jsonb_typeof(nested->'id') is distinct from 'string' or length(btrim(nested->>'id'))=0 or length(nested->>'id')>100
          or jsonb_typeof(nested->'name') is distinct from 'string' or length(btrim(nested->>'name'))=0
          or exists(select 1 from unnest(array['role','phone','email','callTime']) required_field where jsonb_typeof(nested->required_field) is distinct from 'string')
          or not coalesce(nested->>'type'=any(array['crew','cast','client','location','other']),false)
          or exists(select 1 from jsonb_each(nested) e where e.key<>all(array['id','type','name','role','phone','email','callTime','department','company','reportTo','notes','directoryScope','directoryLabel','makeupTime','readyTime','releaseTime','pickup','availability']) or jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>10000)
          or ((nested ? 'directoryScope' or nested ? 'directoryLabel') and (not coalesce(nested->>'directoryScope'=any(array['organization','production','phase']),false) or coalesce(length(btrim(nested->>'directoryLabel')),0)=0))
          or exists(select 1 from unnest(array['callTime','makeupTime','readyTime','releaseTime']) k where coalesce(nested->>k,'')<>'' and nested->>k !~ '^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$') then
          raise sqlstate 'PT400' using message = 'Invalid schedule document';
        end if;
      end loop;
    elsif field.key = 'callsheet' then
      if jsonb_typeof(field.value) is distinct from 'object' then
        raise sqlstate 'PT400' using message = 'Invalid schedule document';
      end if;
      for item in select jsonb_build_object('key',key,'value',value) from jsonb_each(field.value) loop
        if not (item->>'key' = any(array['basecamp','parking','hospital','emergency','mealNotes','safetyNotes','specialInstructions','notes','productionOffice','hospitalPhone','hospitalNotes','advanceSchedule','reportLocation','reportInstructions','primaryContact','primaryPhone','crewCall','firstShot','mealTime','estimatedWrap','timeZone','mealLocation','mealContact','mealHeadcount','departmentNotes','walkieChannels','preparedBy','revisionNotes']))
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
      if field.key = any(array['action','otherText','desc','loc','locName','locAddress','notes','cast','keyInstruction','status','contactName','contactTitle','contactPhone','contactEmail','timeIn','dur','fixedOutTime']) then
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

-- Client is also available in shared organization, production and phase directories.
create or replace function public.save_directory_contact(target_schedule_id uuid,target_scope text,target_contact_id uuid,next_contact jsonb,expected_version bigint,archive_contact boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;prod uuid;phase uuid;locked_org uuid;locked_prod uuid;label text;before private.contact_directory;saved private.contact_directory;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null;
 if not found then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 locked_org:=s.organization_id;locked_prod:=s.production_id;
 perform private.lock_schedule_permissions(locked_org,locked_prod);
 -- Recheck and lock placement after the organization lock; concurrent moves cannot change scope.
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null for share;
 if not found or s.organization_id<>locked_org or s.production_id<>locked_prod or not public.schedule_visible(s.id,'edit') then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 if target_scope='organization' then
  if not public.is_org_admin(s.organization_id) or not private.schedule_actor_can(auth.uid(),'edit',s.organization_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  select name into label from public.organizations where id=s.organization_id;
 elsif target_scope in ('production','phase') then
  if not public.schedule_capability('organize',s.production_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  prod:=s.production_id;
  if target_scope='phase' then
   phase:=coalesce((select phase_id from public.production_days where id=s.production_day_id and deleted_at is null),s.phase_id);
   select name into label from public.phases where id=phase and production_id=prod and deleted_at is null for share;
   if not found then raise sqlstate 'PT404' using message='Phase unavailable';end if;
  else select name into label from public.productions where id=prod;end if;
 else raise sqlstate 'PT400' using message='Invalid contact scope';end if;
 if target_contact_id is null or expected_version is not null and expected_version<1 or archive_contact is null then raise sqlstate 'PT400' using message='Invalid contact';end if;
 if not archive_contact then
  if jsonb_typeof(next_contact) is distinct from 'object' then raise sqlstate 'PT400' using message='Invalid contact';end if;
  if next_contact->>'id' is distinct from target_contact_id::text or not coalesce(next_contact->>'type'=any(array['crew','cast','client','location','other']),false)
   or coalesce(length(btrim(next_contact->>'name')),0) not between 1 and 160
   or exists(select 1 from unnest(array['id','type','name','role','phone','email']) k where jsonb_typeof(next_contact->k) is distinct from 'string')
   or exists(select 1 from jsonb_each(next_contact) e where e.key<>all(array['id','type','name','role','phone','email','department','company']) or jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>500)
   then raise sqlstate 'PT400' using message='Invalid contact';end if;
 end if;
 select * into before from private.contact_directory where id=target_contact_id for update;
 if found and (before.organization_id<>s.organization_id or before.production_id is distinct from prod or before.phase_id is distinct from phase) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 -- Stable ID/payload/version makes a retry after a lost response safe.
 if before.id is not null and before.version=coalesce(expected_version,0)+1 and
  ((archive_contact and before.archived_at is not null) or (not archive_contact and before.archived_at is null and before.contact=next_contact))
  and (expected_version is not null or before.created_by=auth.uid()) then saved:=before;
 else
  if before.id is null and expected_version is not null or before.id is not null and (expected_version is null or before.version<>expected_version or before.archived_at is not null)
   or archive_contact and before.id is null then raise sqlstate 'PT409' using message='Contact changed';end if;
  if before.id is null then
   if (select count(*) from private.contact_directory where organization_id=s.organization_id and archived_at is null)>=5000 then raise sqlstate 'PT400' using message='Contact limit reached';end if;
   insert into private.contact_directory(id,organization_id,production_id,phase_id,contact,created_by) values(target_contact_id,s.organization_id,prod,phase,next_contact,auth.uid()) returning * into saved;
  else
   update private.contact_directory set contact=case when archive_contact then contact else next_contact end,archived_at=case when archive_contact then now() else null end,version=version+1,updated_at=now() where id=target_contact_id returning * into saved;
  end if;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
   values(s.organization_id,auth.uid(),case when archive_contact then 'contact.archive' when expected_version is null then 'contact.create' else 'contact.update' end,'contact_directory',saved.id,jsonb_build_object('scope',target_scope,'version',saved.version));
 end if;
 return jsonb_build_object('id',saved.id,'scope',target_scope,'label',label,'version',saved.version,'contact',saved.contact,'canManage',true,'archived',saved.archived_at is not null);
end; $$;

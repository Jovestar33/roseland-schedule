-- Additive contract: old previews keep their day-assignment grouping RPC.
-- New Library groups by effective phase, whether or not a day is assigned.
create function public.order_schedule_phase_group(target_production_id uuid,target_phase_id uuid,ordered_ids uuid[],expected_versions bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actual uuid[];result jsonb;
begin
 perform public.require_active_schedule_session();
 select organization_id into org from public.productions where id=target_production_id;
 perform private.lock_schedule_permissions(org,target_production_id);
 if not public.schedule_capability('read',target_production_id) then raise sqlstate 'PT404' using message='Library ordering unavailable';end if;
 -- Placement and policy mutations use this same organization lock.
 perform 1 from public.schedules where production_id=target_production_id order by id for update;
 if ordered_ids is null or expected_versions is null or array_ndims(ordered_ids) is distinct from 1 or array_ndims(expected_versions) is distinct from 1 or array_lower(ordered_ids,1)<>1 or array_lower(expected_versions,1)<>1 or cardinality(ordered_ids)<1 or cardinality(ordered_ids)>5000 or cardinality(ordered_ids)<>cardinality(expected_versions)
  or array_position(ordered_ids,null) is not null or array_position(expected_versions,null) is not null
  or (select count(distinct x) from unnest(ordered_ids) x)<>cardinality(ordered_ids) then raise sqlstate 'PT400' using message='Invalid library order'; end if;
 select array_agg(s.id order by s.id) into actual from public.schedules s left join public.production_days d on d.id=s.production_day_id
  where s.production_id=target_production_id and s.deleted_at is null and s.status<>'archived'
  and coalesce(d.phase_id,s.phase_id) is not distinct from target_phase_id and public.schedule_visible(s.id,'read');
 if actual is distinct from (select array_agg(x order by x) from unnest(ordered_ids) x) then raise sqlstate 'PT409' using message='Library group changed; refresh before arranging'; end if;
 for i in 1..cardinality(ordered_ids) loop
  if not public.schedule_visible(ordered_ids[i],'organize') then raise sqlstate 'PT404' using message='Library ordering unavailable'; end if;
  perform 1 from public.schedules where id=ordered_ids[i] and document_version=expected_versions[i];
  if not found then raise sqlstate 'PT409' using message='Schedule changed; refresh before arranging'; end if;
 end loop;
 for i in 1..cardinality(ordered_ids) loop update public.schedules set library_position=i where id=ordered_ids[i];end loop;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(org,auth.uid(),'schedule.order','production',target_production_id,jsonb_build_object('count',cardinality(ordered_ids)));
 select jsonb_agg(jsonb_build_object('id',id,'version',document_version,'position',library_position) order by library_position) into result from public.schedules where id=any(ordered_ids);
 return result;
end; $$;

revoke all on function public.order_schedule_phase_group(uuid,uuid,uuid[],bigint[]) from public,anon,service_role;
grant execute on function public.order_schedule_phase_group(uuid,uuid,uuid[],bigint[]) to authenticated;

-- Organizer-only phase names, with stable create IDs and optimistic rename versions.
-- No schedule documents or placement are rewritten when a grouping label changes.
create function public.save_library_phase(target_production_id uuid,target_phase_id uuid,next_name text,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;saved public.phases;next_position integer;
begin
 perform public.require_active_schedule_session();
 select organization_id into org from public.productions where id=target_production_id;
 perform private.lock_schedule_permissions(org,target_production_id);
 if not public.schedule_capability('organize',target_production_id) then raise sqlstate 'PT404' using message='Phase unavailable';end if;
 if target_phase_id is null or next_name is null or char_length(btrim(next_name)) not between 1 and 120
  or expected_version is not null and expected_version<1 then raise sqlstate 'PT400' using message='Invalid phase details';end if;
 if expected_version is null then
  select coalesce(max(position),-1)+1 into next_position from public.phases where production_id=target_production_id and deleted_at is null;
  if next_position>1000000 then raise sqlstate 'PT400' using message='Phase limit reached';end if;
  insert into public.phases(id,organization_id,production_id,name,position,created_by,updated_by)
   values(target_phase_id,org,target_production_id,btrim(next_name),next_position,auth.uid(),auth.uid()) returning * into saved;
 else
  update public.phases set name=btrim(next_name) where id=target_phase_id and production_id=target_production_id
   and deleted_at is null and version=expected_version returning * into saved;
  if not found then raise sqlstate 'PT409' using message='Phase changed; refresh before renaming';end if;
 end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,auth.uid(),case when expected_version is null then 'phase.create' else 'phase.rename' end,'phase',saved.id,jsonb_build_object('version',saved.version));
 return jsonb_build_object('id',saved.id,'name',saved.name,'version',saved.version);
exception when unique_violation then raise sqlstate 'PT409' using message='Phase already exists; refresh before retrying';
end; $$;
revoke all on function public.save_library_phase(uuid,uuid,text,bigint) from public,anon,service_role;
grant execute on function public.save_library_phase(uuid,uuid,text,bigint) to authenticated;

create or replace function public.schedule_creation_destinations(target_organization_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('productions',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',p.library_position,'version',p.version,
  'create',public.schedule_capability('create',p.id),'organize',public.schedule_capability('organize',p.id),
  'phases',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'version',f.version) order by f.position,f.id),'[]') from public.phases f where f.production_id=p.id and f.deleted_at is null),
  'days',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phase',d.phase_id,'date',d.calendar_date,'number',d.day_number,'position',d.position) order by d.position,d.id),'[]') from public.production_days d where d.production_id=p.id and d.deleted_at is null and (d.phase_id is null or exists(select 1 from public.phases f where f.id=d.phase_id and f.deleted_at is null)))
 ) order by p.library_position,lower(p.name),p.id),'[]')) from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null;
$$;

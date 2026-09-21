-- Phase hubs are a first-class part of Library order. Keep this additive so
-- the existing schedule and production ordering contracts remain intact.
create or replace function public.move_library_phase(
  target_production_id uuid,
  target_phase_id uuid,
  adjacent_phase_id uuid,
  expected_target_version bigint,
  expected_adjacent_version bigint
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  org uuid;
  target public.phases;
  adjacent public.phases;
  temporary_position integer;
  result jsonb;
begin
  perform public.require_active_schedule_session();
  if target_production_id is null or target_phase_id is null or adjacent_phase_id is null
    or target_phase_id=adjacent_phase_id or expected_target_version is null or expected_adjacent_version is null then
    raise sqlstate 'PT400' using message='Invalid phase order';
  end if;
  select organization_id into org from public.productions where id=target_production_id;
  perform private.lock_schedule_permissions(org,target_production_id);
  perform 1 from public.phases where id in(target_phase_id,adjacent_phase_id) order by id for update;
  select * into target from public.phases where id=target_phase_id;
  select * into adjacent from public.phases where id=adjacent_phase_id;
  if target.id is null or adjacent.id is null or target.deleted_at is not null or adjacent.deleted_at is not null
    or target.production_id<>target_production_id or adjacent.production_id<>target_production_id
    or target.organization_id<>adjacent.organization_id or not public.schedule_capability('organize',target_production_id) then
    raise sqlstate 'PT404' using message='Phase ordering unavailable';
  end if;
  if target.version<>expected_target_version or adjacent.version<>expected_adjacent_version then
    raise sqlstate 'PT409' using message='Phase changed; refresh before arranging';
  end if;
  if exists(select 1 from public.phases f where f.production_id=target_production_id and f.deleted_at is null
    and f.position>least(target.position,adjacent.position) and f.position<greatest(target.position,adjacent.position)) then
    raise sqlstate 'PT409' using message='Phase order changed; refresh before arranging';
  end if;
  select max(position)+1 into temporary_position from public.phases
    where production_id=target_production_id and deleted_at is null;
  if temporary_position is null then temporary_position=0; end if;
  if temporary_position>1000000 then
    select slot into temporary_position from generate_series(0,1000000) slot
      where not exists(select 1 from public.phases f where f.production_id=target_production_id and f.deleted_at is null and f.position=slot)
      order by slot limit 1;
  end if;
  if temporary_position is null then raise sqlstate 'PT409' using message='No available phase position'; end if;
  update public.phases set position=temporary_position where id=target.id;
  update public.phases set position=target.position where id=adjacent.id;
  update public.phases set position=adjacent.position where id=target.id;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
    values(org,auth.uid(),'phase.order','phase',target.id,jsonb_build_object('adjacent_id',adjacent.id));
  select jsonb_agg(jsonb_build_object('id',id,'version',version,'position',position) order by position,id)
    into result from public.phases where id in(target.id,adjacent.id);
  return result;
end; $$;

revoke all on function public.move_library_phase(uuid,uuid,uuid,bigint,bigint) from public,anon,service_role;
grant execute on function public.move_library_phase(uuid,uuid,uuid,bigint,bigint) to authenticated;

create or replace function public.schedule_creation_destinations(target_organization_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('productions',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',p.library_position,'version',p.version,
  'create',public.schedule_capability('create',p.id),'organize',public.schedule_capability('organize',p.id),
  'phases',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'position',f.position,'version',f.version) order by f.position,f.id),'[]') from public.phases f where f.production_id=p.id and f.deleted_at is null),
  'days',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phase',d.phase_id,'date',d.calendar_date,'number',d.day_number,'position',d.position) order by d.position,d.id),'[]') from public.production_days d where d.production_id=p.id and d.deleted_at is null and (d.phase_id is null or exists(select 1 from public.phases f where f.id=d.phase_id and f.deleted_at is null)))
 ) order by p.library_position,lower(p.name),p.id),'[]')) from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null;
$$;

-- Shared hub order is independent of schedule positions and production membership.
alter table public.productions add column library_position bigint not null default 0 check (library_position >= 0);
-- Schema backfill also includes read-only organizations; restore their write guard
-- in this same migration transaction before exposing any ordering operation.
alter table public.productions disable trigger a_organization_writable;
with ranked as (
 select id,row_number() over(partition by organization_id order by lower(name),id) as position from public.productions
)
update public.productions p set library_position=r.position from ranked r where p.id=r.id;
alter table public.productions enable trigger a_organization_writable;

create function private.append_production_hub() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||new.organization_id::text,0));
 select coalesce(max(p.library_position),0)+1 into new.library_position from public.productions p where p.organization_id=new.organization_id;
 return new;
end; $$;
revoke all on function private.append_production_hub() from public,anon,authenticated,service_role;
create trigger append_production_hub before insert on public.productions for each row execute function private.append_production_hub();

create function public.move_production_hub(target_production_id uuid,adjacent_production_id uuid,expected_target_version bigint,expected_adjacent_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;target public.productions;adjacent public.productions;result jsonb;
begin
 perform public.require_active_schedule_session();
 if target_production_id is null or adjacent_production_id is null or target_production_id=adjacent_production_id or expected_target_version is null or expected_adjacent_version is null then
  raise sqlstate 'PT400' using message='Invalid production order';
 end if;
 select organization_id into org from public.productions where id=target_production_id;
 perform private.lock_schedule_permissions(org,target_production_id);
 perform 1 from public.productions where id in (target_production_id,adjacent_production_id) order by id for update;
 select * into target from public.productions where id=target_production_id;
 select * into adjacent from public.productions where id=adjacent_production_id;
 if target.id is null or adjacent.id is null or target.deleted_at is not null or adjacent.deleted_at is not null or target.organization_id<>adjacent.organization_id
  or not public.schedule_capability('organize',target.id) or not public.schedule_capability('organize',adjacent.id) then
  raise sqlstate 'PT404' using message='Production ordering unavailable';
 end if;
 if target.version<>expected_target_version or adjacent.version<>expected_adjacent_version then
  raise sqlstate 'PT409' using message='Production changed; refresh before arranging';
 end if;
 -- Only move past the adjacent visible hub; inaccessible productions keep their positions.
 if exists(select 1 from public.productions p where p.organization_id=org and p.deleted_at is null
  and p.library_position>least(target.library_position,adjacent.library_position)
  and p.library_position<greatest(target.library_position,adjacent.library_position)
  and public.schedule_capability('discover',p.id)) then
  raise sqlstate 'PT409' using message='Production order changed; refresh before arranging';
 end if;
 update public.productions set library_position=case when id=target.id then adjacent.library_position else target.library_position end where id in(target.id,adjacent.id);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,auth.uid(),'production.order','production',target.id,jsonb_build_object('adjacent_id',adjacent.id));
 select jsonb_agg(jsonb_build_object('id',id,'version',version,'position',library_position) order by library_position,id) into result from public.productions where id in(target.id,adjacent.id);
 return result;
end; $$;
revoke all on function public.move_production_hub(uuid,uuid,bigint,bigint) from public,anon,service_role;
grant execute on function public.move_production_hub(uuid,uuid,bigint,bigint) to authenticated;

create or replace function public.schedule_creation_destinations(target_organization_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('productions',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'position',p.library_position,'version',p.version,
  'create',public.schedule_capability('create',p.id),'organize',public.schedule_capability('organize',p.id),
  'phases',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.position,f.id),'[]') from public.phases f where f.production_id=p.id and f.deleted_at is null),
  'days',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phase',d.phase_id,'date',d.calendar_date,'number',d.day_number,'position',d.position) order by d.position,d.id),'[]') from public.production_days d where d.production_id=p.id and d.deleted_at is null and (d.phase_id is null or exists(select 1 from public.phases f where f.id=d.phase_id and f.deleted_at is null)))
 ) order by p.library_position,lower(p.name),p.id),'[]')) from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null;
$$;

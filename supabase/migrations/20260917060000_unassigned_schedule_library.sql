-- Production-contained Unassigned schedules; never manufacture a date or day.
alter table public.schedules alter column production_day_id drop not null;
alter table public.schedules add column phase_id uuid;
alter table public.schedules add constraint schedules_unassigned_phase_fk foreign key(organization_id,production_id,phase_id) references public.phases(organization_id,production_id,id) on delete restrict;
alter table public.schedules add constraint schedules_phase_placement check(production_day_id is null or phase_id is null);
alter table public.schedules add column library_position bigint not null default 0 check(library_position>=0 and library_position<9007199254740991);

create function private.lock_schedule_placement(prod uuid,day uuid,phase uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid; d public.production_days;
begin
 select organization_id into org from public.productions where id=prod;
 perform private.lock_schedule_permissions(org,prod);
 if day is not null then
  select * into d from public.production_days where id=day and production_id=prod and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Placement unavailable'; end if;
  if phase is not null and phase is distinct from d.phase_id then raise sqlstate 'PT400' using message='Day and phase do not match'; end if;
  phase:=d.phase_id;
 end if;
 if phase is not null then
  perform 1 from public.phases where id=phase and production_id=prod and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Placement unavailable'; end if;
 end if;
end; $$;

create function public.create_schedule_in_production(target_schedule_id uuid,target_production_id uuid,target_day_id uuid,target_phase_id uuid,
 next_display_name text,next_slug text,next_document jsonb,schema_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;saved public.schedules;
begin
 perform private.lock_schedule_placement(target_production_id,target_day_id,target_phase_id);
 select organization_id into org from public.productions where id=target_production_id;
 if not public.schedule_capability('create',target_production_id) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 if target_schedule_id is null then raise sqlstate 'PT400' using message='Schedule ID is required'; end if;
 perform private.validate_schedule_name(next_display_name,next_slug);
 perform private.validate_schedule_document(next_document,schema_version);
 insert into public.schedules(id,organization_id,production_id,production_day_id,phase_id,display_name,slug,document,document_schema_version,town,created_by,updated_by)
 values(target_schedule_id,org,target_production_id,target_day_id,case when target_day_id is null then target_phase_id else null end,next_display_name,next_slug,next_document,schema_version,nullif(btrim(next_document->'meta'->>'town'),''),auth.uid(),auth.uid()) returning * into saved;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(org,auth.uid(),'schedule.create','schedule',saved.id,jsonb_build_object('version',1));
 return to_jsonb(saved);
exception when unique_violation then raise sqlstate 'PT409' using message='Schedule identity or slug already exists';
end; $$;

create function public.place_schedule(target_schedule_id uuid,expected_version bigint,target_day_id uuid,target_phase_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_row public.schedules;saved public.schedules;
begin
 select * into old_row from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 perform private.lock_schedule_placement(old_row.production_id,target_day_id,target_phase_id);
 if not public.schedule_visible(target_schedule_id,'organize') or old_row.deleted_at is not null then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 if expected_version is null or expected_version<1 or expected_version>=9007199254740991 then raise sqlstate 'PT400' using message='Expected version required'; end if;
 update public.schedules set production_day_id=target_day_id,phase_id=case when target_day_id is null then target_phase_id else null end
 where id=target_schedule_id and document_version=expected_version and production_id=old_row.production_id returning * into saved;
 if not found then raise sqlstate 'PT409' using message='Schedule changed; review placement again'; end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(saved.organization_id,auth.uid(),'schedule.place','schedule',saved.id,jsonb_build_object('from_version',expected_version,'version',saved.document_version,'day',target_day_id,'phase',target_phase_id));
 return to_jsonb(saved);
end; $$;

create function public.list_schedule_library(target_organization_id uuid,after_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from (
 select s.id,s.organization_id,s.production_id,s.production_day_id,s.phase_id,s.display_name,s.slug,s.status,s.deleted_at,s.document_version,s.updated_at,s.library_position,
  s.document->'meta'->>'date' as schedule_date,s.town,p.name as production_name,ph.name as phase_name,coalesce(d.phase_id,s.phase_id) as effective_phase_id,d.day_number,d.calendar_date,
  public.schedule_visible(s.id,'edit') as can_edit,public.schedule_visible(s.id,'organize') as can_organize,public.schedule_visible(s.id,'trash') as can_trash,public.schedule_visible(s.id,'transfer') as can_transfer,public.schedule_visible(s.id,'create') as can_copy
 from public.schedules s join public.productions p on p.id=s.production_id left join public.production_days d on d.id=s.production_day_id left join public.phases ph on ph.id=coalesce(d.phase_id,s.phase_id)
 where s.organization_id=target_organization_id and (after_id is null or s.id>after_id) order by s.id limit 100) t;
$$;
create function public.schedule_creation_destinations(target_organization_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('productions',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,
  'create',public.schedule_capability('create',p.id),'organize',public.schedule_capability('organize',p.id),
  'phases',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.position,f.id),'[]') from public.phases f where f.production_id=p.id and f.deleted_at is null),
  'days',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'phase',d.phase_id,'date',d.calendar_date,'number',d.day_number,'position',d.position) order by d.position,d.id),'[]') from public.production_days d where d.production_id=p.id and d.deleted_at is null and (d.phase_id is null or exists(select 1 from public.phases f where f.id=d.phase_id and f.deleted_at is null)))
 ) order by lower(p.name),p.id),'[]')) from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null;
$$;

create function public.order_schedule_library(target_production_id uuid,target_phase_id uuid,unassigned boolean,ordered_ids uuid[],expected_versions bigint[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;actual uuid[];result jsonb;
begin
 select organization_id into org from public.productions where id=target_production_id;
 perform private.lock_schedule_permissions(org,target_production_id);
 if ordered_ids is null or expected_versions is null or unassigned is null or cardinality(ordered_ids)<1 or cardinality(ordered_ids)>5000 or cardinality(ordered_ids)<>cardinality(expected_versions)
  or array_position(ordered_ids,null) is not null or array_position(expected_versions,null) is not null
  or (select count(distinct x) from unnest(ordered_ids) x)<>cardinality(ordered_ids) then raise sqlstate 'PT400' using message='Invalid library order'; end if;
 select array_agg(s.id order by s.id) into actual from public.schedules s left join public.production_days d on d.id=s.production_day_id
  where s.production_id=target_production_id and s.deleted_at is null and s.status<>'archived' and (s.production_day_id is null)=unassigned
  and (unassigned or coalesce(d.phase_id,s.phase_id) is not distinct from target_phase_id) and public.schedule_visible(s.id,'read');
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

revoke all on function private.lock_schedule_placement(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_schedule_in_production(uuid,uuid,uuid,uuid,text,text,jsonb,integer),public.place_schedule(uuid,bigint,uuid,uuid),public.list_schedule_library(uuid,uuid),public.schedule_creation_destinations(uuid),public.order_schedule_library(uuid,uuid,boolean,uuid[],bigint[]) from public,anon,service_role;
grant execute on function public.create_schedule_in_production(uuid,uuid,uuid,uuid,text,text,jsonb,integer),public.place_schedule(uuid,bigint,uuid,uuid),public.list_schedule_library(uuid,uuid),public.schedule_creation_destinations(uuid),public.order_schedule_library(uuid,uuid,boolean,uuid[],bigint[]) to authenticated;

create or replace function private.schedule_actor_can(actor uuid, action text, org uuid, prod uuid default null, sched uuid default null)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare org_role text; prod_role text; allowed boolean; s public.schedules;
begin
 if actor is null or action not in ('discover','read','history','edit','create','organize','trash','export','transfer','permissions') then return false; end if;
 select m.role::text into org_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id
  where m.organization_id=org and m.user_id=actor and m.status='active' and o.deleted_at is null;
 if org_role is null then return false; end if;
 if prod is not null then
  if not exists(select 1 from public.productions where id=prod and organization_id=org and deleted_at is null) then return false; end if;
  select role::text into prod_role from public.production_memberships where production_id=prod and user_id=actor and status='active';
 end if;
 if sched is not null then
  select * into s from public.schedules where id=sched and organization_id=org and production_id=prod;
  if not found then return false; end if;
  if s.phase_id is not null and not exists(select 1 from public.phases where id=s.phase_id and deleted_at is null) then return false;end if;
  if s.production_day_id is not null and not exists(select 1 from public.production_days d where d.id=s.production_day_id and d.deleted_at is null
    and (d.phase_id is null or exists(select 1 from public.phases p where p.id=d.phase_id and p.deleted_at is null))) then return false; end if;
 end if;
 allowed := case
  when action='permissions' then org_role in ('owner','admin')
  when action='discover' then true
  when org_role in ('owner','admin') then true
  when prod_role='organizer' then true
  when prod_role='editor' then action in ('read','history','edit','export')
  when prod_role='viewer' then action in ('read','history','export')
  else false end;
 if not allowed then return false; end if;
 if exists(select 1 from public.schedule_restrictions r where r.organization_id=org
  and (r.production_id is null or r.production_id=prod) and (r.schedule_id is null or r.schedule_id=sched)
  and (r.subject_user_id=actor or r.subject_role='everyone' or r.subject_role=org_role or (org_role='member' and r.subject_role=prod_role))
  and (action=any(r.denied_actions) or (action not in ('permissions','discover') and 'read'=any(r.denied_actions)))) then return false; end if;
 if sched is not null and s.deleted_at is not null and action <> 'permissions' then
  return action in ('read','history','trash') and private.schedule_actor_can(actor,'trash',org,prod,null)
    and not exists(select 1 from public.schedule_restrictions r where r.schedule_id=sched
      and (r.subject_user_id=actor or r.subject_role in ('everyone',org_role) or (org_role='member' and r.subject_role=prod_role))
      and 'trash'=any(r.denied_actions));
 end if;
 return true;
end; $$;

create or replace function private.enforce_schedule_permissions()
returns trigger language plpgsql security definer set search_path='' as $$
declare action text;
begin
 -- Local fixtures/migrations run as postgres without an end-user identity.
 if auth.uid() is null then
  if session_user <> 'postgres' then raise sqlstate 'PT401' using message='Authentication required'; end if;
  return new;
 end if;
 perform private.lock_schedule_permissions(new.organization_id,new.production_id);
 if tg_op='INSERT' then
  if new.library_position=0 then select coalesce(max(library_position),0)+1 into new.library_position from public.schedules where production_id=new.production_id;end if;
  if not private.schedule_actor_can(auth.uid(),'create',new.organization_id,new.production_id,null) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 else
  action := case when new.deleted_at is distinct from old.deleted_at then 'trash'
   when new.display_name is distinct from old.display_name or new.slug is distinct from old.slug or new.status is distinct from old.status
    or new.production_day_id is distinct from old.production_day_id or new.phase_id is distinct from old.phase_id or new.library_position is distinct from old.library_position then 'organize' else 'edit' end;
  if not private.schedule_actor_can(auth.uid(),action,old.organization_id,old.production_id,old.id) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 end if;
 return new;
end; $$;

create or replace function public.update_schedule_document(
  target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_schedule public.schedules;
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
  perform private.lock_schedule_permissions(current_schedule.organization_id,current_schedule.production_id);
  if not public.schedule_visible(current_schedule.id,'edit') then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
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
  perform private.lock_schedule_placement(current_schedule.production_id,current_schedule.production_day_id,current_schedule.phase_id);
  perform private.validate_schedule_document(next_document, schema_version);
  -- One conditional UPDATE serializes competing writers; the existing trigger
  -- increments the version, attributes the actor and inserts immutable history.
  -- History failure rolls back the update. No force/last-write-wins escape exists.
  update public.schedules s
    set document = next_document, document_schema_version = schema_version,
      town = nullif(btrim(next_document->'meta'->>'town'), '')
    where s.id = target_schedule_id and s.document_version = expected_version
      and s.deleted_at is null and s.production_day_id is not distinct from current_schedule.production_day_id and s.production_id=current_schedule.production_id
    returning s.* into saved;
  if not found then raise sqlstate 'PT409' using message = 'Schedule changed; reload before saving'; end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.mutate_schedule(target_schedule_id uuid, expected_version bigint,
  operation text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_row public.schedules; saved public.schedules; original public.schedules;
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
  original:=old_row;
  perform private.lock_schedule_placement(old_row.production_id,old_row.production_day_id,old_row.phase_id);
  perform private.lock_schedule_permissions(old_row.organization_id,old_row.production_id);
  if not public.schedule_visible(old_row.id,case when operation='restore_version' then 'edit' when operation in ('delete','restore') then 'trash' else 'organize' end) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  select * into old_row from public.schedules where id=target_schedule_id for update;
  if (old_row.production_id,old_row.production_day_id,old_row.phase_id) is distinct from (original.production_id,original.production_day_id,original.phase_id) then
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

create or replace function public.record_schedule_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare snapshot jsonb;
begin
  snapshot := jsonb_build_object('display_name',new.display_name,'slug',new.slug,
    'production_id',new.production_id,'phase_id',new.phase_id,'library_position',new.library_position,'production_day_id',new.production_day_id,'status',new.status,
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

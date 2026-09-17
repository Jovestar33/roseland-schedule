-- B03 restrictive scheduling policies. No data migration or automatic role promotion.
create table public.schedule_restrictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  production_id uuid,
  schedule_id uuid,
  subject_role text check (subject_role in ('everyone','owner','admin','organizer','editor','viewer')),
  subject_user_id uuid references auth.users(id) on delete restrict,
  denied_actions text[] not null check (cardinality(denied_actions)>0 and denied_actions <@ array['discover','read','history','edit','create','organize','trash','export','transfer','permissions']::text[]),
  authority text not null check(authority in ('owner','admin')),
  created_by uuid not null references auth.users(id) on delete restrict,
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((subject_role is null) <> (subject_user_id is null)),
  check (schedule_id is null or production_id is not null),
  foreign key(organization_id,production_id) references public.productions(organization_id,id) on delete restrict,
  foreign key(organization_id,production_id,schedule_id) references public.schedules(organization_id,production_id,id) on delete restrict
);
create index schedule_restrictions_scope on public.schedule_restrictions(organization_id,production_id,schedule_id);
alter table public.schedule_restrictions enable row level security;
revoke all on public.schedule_restrictions from public,anon,authenticated,service_role;

create function private.schedule_actor_can(actor uuid, action text, org uuid, prod uuid default null, sched uuid default null)
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

create function public.schedule_capability(action text, target_production_id uuid, target_schedule_id uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.schedule_actor_can(auth.uid(),action,p.organization_id,p.id,target_schedule_id)
  from public.productions p where p.id=target_production_id),false);
$$;
create function public.schedule_visible(target_schedule_id uuid, action text default 'read')
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select private.schedule_actor_can(auth.uid(),action,s.organization_id,s.production_id,s.id) from public.schedules s where s.id=target_schedule_id),false);
$$;
create or replace function public.can_edit_production(target_production_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.schedule_capability('edit',target_production_id,null);
$$;

-- Policy changes and scheduling mutations serialize on the same transaction lock.
-- Membership SHARE locks compose with existing suspension/revocation workflows.
create function private.lock_schedule_permissions(org uuid, prod uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 perform 1 from public.organizations where id=org and deleted_at is null for share;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 if prod is not null then
  perform 1 from public.productions where id=prod and organization_id=org and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 end if;
 perform 1 from public.organization_memberships where organization_id=org and user_id=auth.uid() for share;
 if prod is not null then perform 1 from public.production_memberships where production_id=prod and user_id=auth.uid() for share; end if;
end; $$;

create function public.set_schedule_restriction(target_id uuid, target_organization_id uuid, target_production_id uuid,
 target_schedule_id uuid, subject_role text, subject_user_id uuid, denied_actions text[], expected_revision bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; old_row public.schedule_restrictions; saved public.schedule_restrictions; target_role text;
begin
 perform private.lock_schedule_permissions(target_organization_id,target_production_id);
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id,target_production_id,target_schedule_id) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 select role::text into actor_role from public.organization_memberships where organization_id=target_organization_id and user_id=auth.uid();
 if target_id is null or expected_revision is null or expected_revision<0 or denied_actions is null
  or not denied_actions <@ array['discover','read','history','edit','create','organize','trash','export','transfer','permissions']::text[]
  or array_position(denied_actions,null) is not null or ((subject_role is null)=(subject_user_id is null))
  or (subject_role is not null and subject_role not in ('everyone','owner','admin','organizer','editor','viewer'))
  or (target_schedule_id is not null and target_production_id is null) then raise sqlstate 'PT400' using message='Invalid restriction'; end if;
 if target_schedule_id is not null and not exists(select 1 from public.schedules where id=target_schedule_id and organization_id=target_organization_id and production_id=target_production_id) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 if subject_user_id is not null then
  select role::text into target_role from public.organization_memberships where organization_id=target_organization_id and user_id=subject_user_id;
  if target_role is null then raise sqlstate 'PT400' using message='Choose an organization member'; end if;
 end if;
 select * into old_row from public.schedule_restrictions where id=target_id for update;
 if found and (old_row.organization_id<>target_organization_id or old_row.production_id is distinct from target_production_id or old_row.schedule_id is distinct from target_schedule_id
  or old_row.subject_role is distinct from subject_role or old_row.subject_user_id is distinct from subject_user_id) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 if coalesce(old_row.revision,0)<>expected_revision then raise sqlstate 'PT409' using message='Permissions changed; reload'; end if;
 if actor_role='admin' and (old_row.authority='owner' or subject_role in ('everyone','owner','admin') or target_role in ('owner','admin') or subject_user_id=auth.uid()) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 if cardinality(denied_actions)=0 then
  delete from public.schedule_restrictions where id=target_id;
 else
  insert into public.schedule_restrictions(id,organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
   values(target_id,target_organization_id,target_production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,actor_role,auth.uid())
   on conflict(id) do update set denied_actions=excluded.denied_actions,authority=excluded.authority,revision=schedule_restrictions.revision+1,updated_at=now()
   returning * into saved;
 end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(target_organization_id,auth.uid(),'schedule.permissions','schedule_restriction',target_id,jsonb_build_object('previous_revision',expected_revision,'removed',cardinality(denied_actions)=0));
 return case when cardinality(denied_actions)=0 then jsonb_build_object('id',target_id,'removed',true) else to_jsonb(saved) end;
end; $$;

create function public.read_schedule_permissions(target_organization_id uuid, target_production_id uuid default null, target_schedule_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id,target_production_id,target_schedule_id) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at,r.id),'[]') into result from public.schedule_restrictions r
  where r.organization_id=target_organization_id and (r.production_id is null or r.production_id=target_production_id) and (r.schedule_id is null or r.schedule_id=target_schedule_id);
 return jsonb_build_object('restrictions',result,'effective',(select jsonb_object_agg(a,private.schedule_actor_can(auth.uid(),a,target_organization_id,target_production_id,target_schedule_id))
  from unnest(array['discover','read','history','edit','create','organize','trash','export','transfer','permissions']) a));
end; $$;

create function public.assign_production_role(target_production_id uuid,target_user_id uuid,next_role text)
returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.productions where id=target_production_id;
 perform private.lock_schedule_permissions(org,target_production_id);
 if not private.schedule_actor_can(auth.uid(),'permissions',org,target_production_id,null) or next_role not in ('organizer','editor','viewer') or next_role is null then raise sqlstate 'PT404' using message='Role assignment unavailable'; end if;
 perform 1 from public.organization_memberships where organization_id=org and user_id=target_user_id and status='active' and role='member' for share;
 if not found then raise sqlstate 'PT404' using message='Member unavailable'; end if;
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)
  values(org,target_production_id,target_user_id,next_role::public.production_role,'active',now())
  on conflict(production_id,user_id) do update set role=excluded.role,status='active';
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,auth.uid(),'production.role','production',target_production_id,jsonb_build_object('user_id',target_user_id,'role',next_role));
end; $$;

create function private.enforce_schedule_permissions()
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
  if not private.schedule_actor_can(auth.uid(),'create',new.organization_id,new.production_id,null) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 else
  action := case when new.deleted_at is distinct from old.deleted_at then 'trash'
   when new.display_name is distinct from old.display_name or new.slug is distinct from old.slug or new.status is distinct from old.status
    or new.production_day_id is distinct from old.production_day_id then 'organize' else 'edit' end;
  if not private.schedule_actor_can(auth.uid(),action,old.organization_id,old.production_id,old.id) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 end if;
 return new;
end; $$;
create trigger schedule_permission_guard before insert or update on public.schedules for each row execute function private.enforce_schedule_permissions();

alter policy schedules_select_authorized on public.schedules using(public.schedule_visible(id,'read'));
alter policy schedule_versions_select_authorized on public.schedule_versions using(public.schedule_visible(schedule_id,'history'));
alter policy phases_insert_editors on public.phases with check(public.schedule_capability('organize',production_id) and created_by=auth.uid() and updated_by=auth.uid());
alter policy phases_update_editors on public.phases using(public.schedule_capability('organize',production_id)) with check(public.schedule_capability('organize',production_id));
alter policy production_days_insert_editors on public.production_days with check(public.schedule_capability('organize',production_id) and created_by=auth.uid() and updated_by=auth.uid());
alter policy production_days_update_editors on public.production_days using(public.schedule_capability('organize',production_id)) with check(public.schedule_capability('organize',production_id));

revoke all on function private.schedule_actor_can(uuid,text,uuid,uuid,uuid),private.lock_schedule_permissions(uuid,uuid),private.enforce_schedule_permissions() from public,anon,authenticated,service_role;
revoke all on function public.schedule_capability(text,uuid,uuid),public.schedule_visible(uuid,text),public.set_schedule_restriction(uuid,uuid,uuid,uuid,text,uuid,text[],bigint),public.read_schedule_permissions(uuid,uuid,uuid),public.assign_production_role(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.schedule_capability(text,uuid,uuid),public.schedule_visible(uuid,text),public.set_schedule_restriction(uuid,uuid,uuid,uuid,text,uuid,text[],bigint),public.read_schedule_permissions(uuid,uuid,uuid),public.assign_production_role(uuid,uuid,text) to authenticated;

create or replace function private.lock_schedule_scope(day_id uuid, admin_required boolean)
returns public.production_days language plpgsql security definer set search_path = '' as $$
declare d public.production_days; actor uuid := auth.uid();
begin
  if actor is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
  select * into d from public.production_days where id=day_id;
  if not found or not public.schedule_capability('read',d.production_id)
    or (admin_required and not public.schedule_capability('trash',d.production_id)) then
    raise sqlstate 'PT404' using message='Schedule unavailable';
  end if;
  perform private.lock_schedule_permissions(d.organization_id,d.production_id);
  -- Same parent lock order as document updates and permission lifecycle functions.
  perform 1 from public.organizations where id=d.organization_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  perform 1 from public.productions where id=d.production_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  perform 1 from public.organization_memberships where organization_id=d.organization_id and user_id=actor for share;
  perform 1 from public.production_memberships where production_id=d.production_id and user_id=actor for share;
  if not public.schedule_capability('read',d.production_id)
    or (admin_required and not public.schedule_capability('trash',d.production_id)) then
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

create or replace function private.validate_schedule_name(schedule_name text, schedule_slug text)
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

create or replace function public.create_schedule(target_schedule_id uuid, target_day_id uuid,
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

create or replace function public.read_deleted_schedule(target_schedule_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
  select to_jsonb(s) into result from public.schedules s where s.id=target_schedule_id
    and s.deleted_at is not null and public.schedule_visible(s.id,'trash');
  if result is null then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  return result;
end;
$$;

create or replace function public.mutate_schedule(target_schedule_id uuid, expected_version bigint,
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
  perform private.lock_schedule_permissions(old_row.organization_id,old_row.production_id);
  if not public.schedule_visible(old_row.id,case when operation='restore_version' then 'edit' when operation in ('delete','restore') then 'trash' else 'organize' end) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
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


create or replace function public.protect_schedule_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.production_id is distinct from old.production_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'schedule identity fields cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and not public.schedule_visible(old.id,'trash') then
    raise exception 'only an organization owner or admin may change schedule deletion state';
  end if;

  if new.document_version is distinct from old.document_version then
    raise exception 'schedule document version must be current';
  end if;

  new.document_version = old.document_version + 1;
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

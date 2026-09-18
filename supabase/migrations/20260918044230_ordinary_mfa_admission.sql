-- B09-A: forward-only ordinary MFA admission. No factor mutation or recovery bypass.
create table private.organization_mfa_policy (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 version bigint not null check(version>0), required_roles text[] not null default '{}'
  check(required_roles <@ array['admin','organizer','editor','viewer']::text[]),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default clock_timestamp()
);
create table private.organization_mfa_policy_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id), fingerprint text not null, version bigint not null
);
alter table private.organization_mfa_policy enable row level security;
alter table private.organization_mfa_policy_receipts enable row level security;
revoke all on private.organization_mfa_policy,private.organization_mfa_policy_receipts from public,anon,authenticated,service_role;

create function private.account_requires_mfa(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.mfa_factors where user_id=actor and status='verified')
  or exists(select 1 from private.platform_operators where user_id=actor and active and role='superadmin');
$$;
create function private.organization_requires_mfa(actor uuid,org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.account_requires_mfa(actor) or exists(
  select 1 from public.organization_memberships m left join private.organization_mfa_policy p on p.organization_id=m.organization_id
  where m.user_id=actor and m.organization_id=org and m.status='active'
  and (m.role='owner' or m.role::text=any(p.required_roles) or exists(
   select 1 from public.production_memberships pm join public.productions pr on pr.id=pm.production_id
   where pm.organization_id=org and pm.user_id=actor and pm.status='active' and pr.deleted_at is null and pm.role::text=any(p.required_roles))));
$$;
-- Only service-role requests may use server-supplied actor context. Browser headers cannot override JWT assurance.
create function private.request_actor_aal(actor uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when auth.jwt()->>'role'='authenticated' and auth.uid()=actor then coalesce(auth.jwt()->>'aal','aal1')
  when auth.jwt()->>'role'='service_role'
   and coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-actor-user-id'=actor::text
  then coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-actor-aal' end;
$$;
create function private.request_actor() returns uuid
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.jwt()->>'role'='authenticated' then return auth.uid(); end if;
 if auth.jwt()->>'role'='service_role' then
  return (coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-actor-user-id')::uuid;
 end if;
 return null;
exception when invalid_text_representation then return null;
end;$$;
create function public.mfa_organization_access(target_organization_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.request_actor() is not null and
 (not private.organization_requires_mfa(private.request_actor(),target_organization_id)
  or private.request_actor_aal(private.request_actor())='aal2');
$$;
create function private.require_organization_mfa(org uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(public.mfa_organization_access(org),false) then raise sqlstate 'PT403' using message='mfa_required'; end if;
end;$$;
create function private.require_recent_totp() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'aal' is distinct from 'aal2' or not exists(
  select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a
  where a->>'method'='totp' and a->>'timestamp' ~ '^[0-9]{1,12}$'
   and (a->>'timestamp')::bigint between extract(epoch from clock_timestamp())-1800 and extract(epoch from clock_timestamp())+60
 ) then raise sqlstate 'PT403' using message='mfa_recent_required'; end if;
end;$$;

create function public.get_my_mfa_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();
 return jsonb_build_object('required',private.account_requires_mfa(auth.uid()),
  'enrolled',exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified'),
  'aal',coalesce(auth.jwt()->>'aal','aal1'));
end;$$;
create function public.list_my_organization_access(after_id uuid default null,target_organization_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();
 return (select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select o.id,o.name,m.role,private.organization_requires_mfa(auth.uid(),o.id) as mfa_required,
   case when public.mfa_organization_access(o.id) then 'ready' else 'mfa_required' end as access_state
  from public.organization_memberships m join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid() and m.status='active' and o.deleted_at is null
   and (after_id is null or o.id>after_id) and (target_organization_id is null or o.id=target_organization_id)
  order by o.id limit 26
 ) page);
end;$$;
create function public.read_organization_mfa_policy(target_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.organization_mfa_policy;
begin
 perform public.require_active_schedule_session();
 perform private.require_organization_mfa(target_organization_id);
 if not public.is_active_org_member(target_organization_id) then raise sqlstate 'PT404' using message='Organization security unavailable'; end if;
 select * into p from private.organization_mfa_policy where organization_id=target_organization_id;
 return jsonb_build_object('organization_id',target_organization_id,'version',coalesce(p.version,0),
  'required_roles',coalesce(p.required_roles,'{}'),
  'can_manage',private.schedule_actor_can(auth.uid(),'permissions',target_organization_id));
end;$$;
create function public.save_organization_mfa_policy(target_organization_id uuid,request_id uuid,expected_version bigint,required_roles text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare fp text; receipt private.organization_mfa_policy_receipts; current_version bigint; roles text[];
begin
 perform public.require_active_schedule_session();
 perform private.lock_schedule_permissions(target_organization_id);
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id) then raise sqlstate 'PT404' using message='Organization security write unavailable'; end if;
 perform private.require_recent_totp();
 if request_id is null or expected_version is null or expected_version<0 or expected_version>=9007199254740991
  or required_roles is null or cardinality(required_roles)>4 or array_position(required_roles,null) is not null
  or not required_roles <@ array['admin','organizer','editor','viewer']::text[] then raise sqlstate 'PT400' using message='Invalid MFA policy'; end if;
 select coalesce(array_agg(distinct r order by r),'{}') into roles from unnest(required_roles) r;
 fp:=private.workflow_fingerprint(jsonb_build_array(target_organization_id,expected_version,roles));
 select * into receipt from private.organization_mfa_policy_receipts r where r.request_id=save_organization_mfa_policy.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.organization_id<>target_organization_id or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Request already used'; end if;
  return jsonb_build_object('confirmed',true,'organization_id',target_organization_id,'request_id',request_id,'version',receipt.version);
 end if;
 select version into current_version from private.organization_mfa_policy where organization_id=target_organization_id;
 if coalesce(current_version,0)<>expected_version then raise sqlstate 'PT409' using message='Security policy changed; review current settings'; end if;
 insert into private.organization_mfa_policy values(target_organization_id,expected_version+1,roles,auth.uid(),clock_timestamp())
 on conflict(organization_id) do update set version=excluded.version,required_roles=excluded.required_roles,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.organization_mfa_policy_receipts values(request_id,target_organization_id,auth.uid(),fp,expected_version+1);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(target_organization_id,auth.uid(),'organization.mfa_policy.update','organization',target_organization_id,jsonb_build_object('version',expected_version+1,'required_roles',roles));
 return jsonb_build_object('confirmed',true,'organization_id',target_organization_id,'request_id',request_id,'version',expected_version+1);
end;$$;

revoke all on function private.account_requires_mfa(uuid),private.organization_requires_mfa(uuid,uuid),private.request_actor_aal(uuid),private.request_actor(),private.require_organization_mfa(uuid),private.require_recent_totp() from public,anon,authenticated,service_role;
revoke all on function public.mfa_organization_access(uuid),public.get_my_mfa_status(),public.list_my_organization_access(uuid,uuid),public.read_organization_mfa_policy(uuid),public.save_organization_mfa_policy(uuid,uuid,bigint,text[]) from public,anon,service_role;
grant execute on function public.mfa_organization_access(uuid),public.get_my_mfa_status(),public.list_my_organization_access(uuid,uuid),public.read_organization_mfa_policy(uuid),public.save_organization_mfa_policy(uuid,uuid,bigint,text[]) to authenticated;

create or replace function private.require_current_account_policies(actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Only these narrow account RPCs remain available for review and activity.
 -- request.path is supplied by PostgREST, not a client JSON field/header.
 if coalesce(current_setting('request.path',true),'')=any(array[
  '/rpc/get_my_mfa_status','/rpc/list_my_organization_access','/rpc/get_account_policy_status','/rpc/accept_account_policies',
  '/rpc/get_account_session_deadline','/rpc/record_account_activity'
 ]) then return; end if;
 if exists(select 1 from private.account_policy_versions p where p.id and p.enforce_acceptance
  and not exists(select 1 from private.account_policy_acceptances a where a.user_id=actor
    and a.terms_version=p.terms_version and a.privacy_version=p.privacy_version)) then
  raise sqlstate 'PT428' using message='Review current account policies';
 end if;
end;$$;

create or replace function private.require_request_session(actor uuid,session_id uuid,expires_at bigint)
returns void language plpgsql security definer set search_path='' as $$
declare session_end timestamptz; created timestamptz; activity timestamptz; exists_session boolean;
begin
 if actor is null or session_id is null or expires_at is null or expires_at<=extract(epoch from clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 if current_setting('transaction_read_only')='on' then
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor;
 else
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor for share;
 end if;
 exists_session:=found;
 select a.last_activity_at into activity from private.account_session_activity a where a.session_id=require_request_session.session_id and a.user_id=actor;
 if not exists_session or session_end<=clock_timestamp() or expires_at<=extract(epoch from clock_timestamp())
   or coalesce(activity,created)<=clock_timestamp()-interval '60 minutes'
   or not exists(select 1 from auth.users u where u.id=actor and coalesce(u.banned_until,'-infinity')<=clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 perform private.require_current_account_policies(actor);
 if coalesce(current_setting('request.path',true),'')<>all(array[
  '/rpc/get_my_mfa_status','/rpc/list_my_organization_access','/rpc/get_account_policy_status',
  '/rpc/accept_account_policies','/rpc/get_account_session_deadline','/rpc/record_account_activity'
 ]) and private.account_requires_mfa(actor) and private.request_actor_aal(actor) is distinct from 'aal2' then
  raise sqlstate 'PT403' using message='mfa_required';
 end if;
end;$$;

create or replace function public.is_active_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_organization_access(target_organization_id) and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.deleted_at is null
  );
$$;

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.mfa_organization_access(target_organization_id) and exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.deleted_at is null
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function private.schedule_actor_can(actor uuid,action text,org uuid,prod uuid default null,sched uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select public.mfa_organization_access(org) and private.schedule_actor_can_without_template_bindings(actor,action,org,prod,sched)
  and (sched is null or action in ('permissions','discover') or private.schedule_template_bindings_allow(actor,action,org,sched));
$$;

create or replace function private.lock_schedule_permissions(org uuid, prod uuid default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 perform private.require_organization_mfa(org);
 perform 1 from public.organizations where id=org and deleted_at is null for share;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 if prod is not null then
  perform 1 from public.productions where id=prod and organization_id=org and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 end if;
 perform 1 from public.organization_memberships where organization_id=org and user_id=auth.uid() for share;
 if prod is not null then perform 1 from public.production_memberships where production_id=prod and user_id=auth.uid() for share; end if;
end; $$;

create or replace function public.read_organization_presentation(target_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; p private.organization_presentation;
begin
 perform public.require_active_schedule_session();
 perform private.require_organization_mfa(target_organization_id);
 select m.role::text into member_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id and m.user_id=auth.uid() and m.status='active' and o.deleted_at is null;
 if member_role is null then raise sqlstate 'PT404' using message='Organization settings unavailable'; end if;
 select * into p from private.organization_presentation where organization_id=target_organization_id;
 return jsonb_build_object('organization_id',target_organization_id,'version',coalesce(p.version,0),'config',coalesce(p.config,'{}'::jsonb),'can_manage',member_role in ('owner','admin'));
end; $$;

create or replace function public.read_snapshot_policy(target_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; p private.schedule_snapshot_policy;
begin
 perform public.require_active_schedule_session();
 perform private.require_organization_mfa(target_organization_id);
 select m.role::text into member_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id and m.user_id=auth.uid() and m.status='active' and o.deleted_at is null;
 if member_role is null then raise sqlstate 'PT404' using message='Snapshot settings unavailable'; end if;
 select * into p from private.schedule_snapshot_policy where organization_id=target_organization_id;
 return jsonb_build_object('organization_id',target_organization_id,'version',coalesce(p.version,0),'retention_days',p.retention_days,'trash_min_role',coalesce(p.trash_min_role,'organizer'),'can_manage',member_role in ('owner','admin'));
end;$$;

do $$declare t record; col text;
 begin
 for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity
   and (c.relname='organizations' or exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped)) loop
  col:=case when t.relname='organizations' then 'id' else 'organization_id' end;
  execute format('create policy mfa_admission on public.%I as restrictive for all to authenticated using (public.mfa_organization_access(%I)) with check (public.mfa_organization_access(%I))',t.relname,col,col);
 end loop;
 end;$$;
 notify pgrst,'reload schema';

-- B11: scoped Client grants. No anonymous table access, hosted keys or real links.
alter table public.schedule_restrictions drop constraint schedule_restrictions_denied_actions_check;
alter table public.schedule_restrictions add constraint schedule_restrictions_denied_actions_check check(cardinality(denied_actions)>0 and denied_actions <@ array['discover','read','history','edit','create','organize','trash','export','transfer','permissions','share']::text[]);
do $$declare d text;begin
 d:=pg_get_functiondef('private.schedule_actor_can_without_template_bindings(uuid,text,uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'''transfer'',''permissions''','''transfer'',''permissions'',''share''');
 d:=replace(d,'''read'',''history'',''edit'',''export''','''read'',''history'',''edit'',''export'',''share''');execute d;
 d:=pg_get_functiondef('public.set_schedule_restriction(uuid,uuid,uuid,uuid,text,uuid,text[],bigint)'::regprocedure);
 d:=replace(d,'''transfer'',''permissions''','''transfer'',''permissions'',''share''');execute d;
 d:=pg_get_functiondef('public.read_schedule_permissions(uuid,uuid,uuid)'::regprocedure);
 d:=replace(d,'''transfer'',''permissions''','''transfer'',''permissions'',''share''');execute d;
end;$$;
create table private.schedule_client_links(
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 schedule_id uuid not null references public.schedules(id), creator_id uuid not null references auth.users(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 revoked_at timestamptz, revoked_by uuid references auth.users(id),
 check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create index schedule_client_links_schedule on private.schedule_client_links(schedule_id,created_at,id);
create index schedule_client_links_organization on private.schedule_client_links(organization_id);
create index schedule_client_links_creator on private.schedule_client_links(creator_id);
create index schedule_client_links_revoker on private.schedule_client_links(revoked_by);
-- Trusted migration imports original alias-to-ID mappings and an approved sponsor.
-- Retain aliases until separately approved retirement (at least twelve months).
create table private.schedule_client_aliases(
 id uuid primary key, legacy_name text not null unique check(length(legacy_name) between 1 and 200),
 organization_id uuid not null references public.organizations(id),schedule_id uuid not null references public.schedules(id),
 creator_id uuid not null references auth.users(id), created_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,revoked_by uuid references auth.users(id)
);
create index schedule_client_aliases_schedule on private.schedule_client_aliases(schedule_id);
create index schedule_client_aliases_organization on private.schedule_client_aliases(organization_id);
create index schedule_client_aliases_creator on private.schedule_client_aliases(creator_id);
create index schedule_client_aliases_revoker on private.schedule_client_aliases(revoked_by);
-- A single bounded service read-rate bucket; delivery/read accounting is not an ordinary tenant write.
create table private.client_view_rate(id boolean primary key default true check(id),window_at timestamptz not null,hits integer not null);
insert into private.client_view_rate values(true,clock_timestamp(),0);
alter table private.schedule_client_links enable row level security;
alter table private.schedule_client_aliases enable row level security;
alter table private.client_view_rate enable row level security;
revoke all on private.schedule_client_links,private.schedule_client_aliases,private.client_view_rate from public,anon,authenticated,service_role;
create trigger organization_write_guard before insert or update or delete on private.schedule_client_links for each row execute function private.guard_organization_write();
create trigger organization_write_guard before insert or update or delete on private.schedule_client_aliases for each row execute function private.guard_organization_write();

-- A Client grant remains bounded by its sponsor's current content/output rights.
-- Anonymous readers do not borrow the sponsor's session or MFA assurance.
create function private.client_sponsor_allowed(actor uuid,s public.schedules) returns boolean language sql stable security definer set search_path='' as $$
 select s.deleted_at is null and s.status<>'archived'
 and exists(select 1 from auth.users u where u.id=actor and (u.banned_until is null or u.banned_until<=now()) and u.deleted_at is null)
 and private.schedule_actor_can_without_template_bindings(actor,'read',s.organization_id,s.production_id,s.id)
 and private.schedule_actor_can_without_template_bindings(actor,'edit',s.organization_id,s.production_id,s.id)
 and private.schedule_actor_can_without_template_bindings(actor,'export',s.organization_id,s.production_id,s.id)
 and private.schedule_actor_can_without_template_bindings(actor,'share',s.organization_id,s.production_id,s.id)
 and private.schedule_template_bindings_allow(actor,'share',s.organization_id,s.id)
 and private.schedule_template_bindings_allow(actor,'export',s.organization_id,s.id);
$$;
create function private.client_can_revoke(actor uuid,creator uuid,s public.schedules) returns boolean language sql stable security definer set search_path='' as $$
 select private.schedule_actor_can(actor,'share',s.organization_id,s.production_id,s.id)
 and private.schedule_actor_can(actor,'read',s.organization_id,s.production_id,s.id)
 and (actor=creator or private.schedule_actor_can(actor,'organize',s.organization_id,s.production_id,s.id));
$$;
create function public.create_schedule_client_link(target_schedule_id uuid,request_id uuid,token_hash text,expected_version bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;l private.schedule_client_links;t timestamptz;
begin
 perform private.require_request_session();
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Sharing unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);perform private.require_organization_writable(s.organization_id);
 select * into s from public.schedules where id=target_schedule_id for share;
 if not private.client_sponsor_allowed(auth.uid(),s) or not public.mfa_organization_access(s.organization_id) then raise sqlstate 'PT404' using message='Sharing unavailable';end if;
 if request_id is null or token_hash is null or token_hash!~'^[a-f0-9]{64}$' then raise sqlstate 'PT400' using message='Invalid link request';end if;
 select * into l from private.schedule_client_links where id=request_id;
 if found then
  if l.creator_id<>auth.uid() or l.schedule_id<>s.id or l.token_hash<>token_hash then raise sqlstate 'PT409' using message='Link request changed';end if;
  return jsonb_build_object('id',l.id,'expires_at',l.expires_at,'revoked',l.revoked_at is not null);
 end if;
 if expected_version is null or s.document_version<>expected_version then raise sqlstate 'PT409' using message='Saved schedule changed; review before sharing';end if;
 if (select count(*) from private.schedule_client_links where creator_id=auth.uid() and created_at>clock_timestamp()-interval '1 minute')>=20 then raise sqlstate 'PT429' using message='Please try again later';end if;
 t:=clock_timestamp();insert into private.schedule_client_links(id,organization_id,schedule_id,creator_id,token_hash,created_at,expires_at)values(request_id,s.organization_id,s.id,auth.uid(),token_hash,t,t+interval '30 days')returning * into l;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)values(s.organization_id,auth.uid(),'schedule.client.create','client_link',l.id,jsonb_build_object('schedule',s.id,'version',s.document_version,'expires_at',l.expires_at));
 return jsonb_build_object('id',l.id,'expires_at',l.expires_at,'revoked',false);
end;$$;
create function public.list_schedule_client_links(target_schedule_id uuid,after_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;rows jsonb;
begin
 perform private.require_request_session();select * into s from public.schedules where id=target_schedule_id;
 if s.id is null or not private.schedule_actor_can(auth.uid(),'read',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Sharing unavailable';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') into rows from (
 select id,'client' as kind,created_at,expires_at,revoked_at,private.client_can_revoke(auth.uid(),creator_id,s) as can_revoke from private.schedule_client_links where schedule_id=s.id and (creator_id=auth.uid() or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id)) and (after_id is null or id>after_id)
 union all select id,'legacy',created_at,null,revoked_at,private.client_can_revoke(auth.uid(),creator_id,s) from private.schedule_client_aliases where schedule_id=s.id and (creator_id=auth.uid() or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id)) and (after_id is null or id>after_id)
 order by id limit 100)x;
 return jsonb_build_object('schedule_id',s.id,'version',s.document_version,'can_create',private.organization_writable(s.organization_id) and public.mfa_organization_access(s.organization_id) and private.client_sponsor_allowed(auth.uid(),s),'links',rows);
end;$$;
create function public.revoke_schedule_client_link(target_schedule_id uuid,target_link_id uuid,link_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;creator uuid;revoked timestamptz;
begin
 perform private.require_request_session();select * into s from public.schedules where id=target_schedule_id;
 if s.id is null then raise sqlstate 'PT404' using message='Sharing unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);perform private.require_organization_writable(s.organization_id);
 select * into s from public.schedules where id=target_schedule_id for share;
 if link_kind='client' then select creator_id,revoked_at into creator,revoked from private.schedule_client_links where id=target_link_id and schedule_id=s.id for update;
 elsif link_kind='legacy' then select creator_id,revoked_at into creator,revoked from private.schedule_client_aliases where id=target_link_id and schedule_id=s.id for update;
 end if;
 if creator is null or not private.client_can_revoke(auth.uid(),creator,s) then raise sqlstate 'PT404' using message='Sharing unavailable';end if;
 if revoked is null then
  if link_kind='client' then update private.schedule_client_links set revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=target_link_id;
  else update private.schedule_client_aliases set revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=target_link_id;end if;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id)values(s.organization_id,auth.uid(),'schedule.client.revoke',link_kind,target_link_id);
 end if;
 return jsonb_build_object('id',target_link_id,'revoked',true);
end;$$;
create function private.client_pick(value jsonb,keys text) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(key,val),'{}') from jsonb_each(case when jsonb_typeof(value)='object' then value else '{}' end) e(key,val) where key=any(string_to_array(keys,' ')) and jsonb_typeof(val) in ('null','string','number','boolean');
$$;
create function private.client_projection(d jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('meta',private.client_pick(d->'meta','town date prod dir dp projectName phase dayNumber totalDays')||jsonb_build_object('wx',case when jsonb_typeof(d->'meta'->'wx')='object' then private.client_pick(d->'meta'->'wx','sunrise sunset maxF minF prec code cond fetchedAt noForecast') else 'null'::jsonb end),
 'rows',coalesce((select jsonb_agg(private.client_pick(r,'action otherText desc loc locLat locLng locName locAddress notes timeIn dur sunLocked fixedOut fixedOutTime')||case when jsonb_typeof(r->'subLocations')='array' then jsonb_build_object('subLocations',(select coalesce(jsonb_agg(private.client_pick(v,'id loc locLat locLng desc name address')),'[]')from jsonb_array_elements(r->'subLocations')v)) else '{}'::jsonb end order by n)from jsonb_array_elements(d->'rows')with ordinality x(r,n) where coalesce(r->>'action','')<>'' or coalesce(r->>'timeIn','')<>''),'[]'));
$$;
-- Service-only endpoint. The application validates legacy HMAC before supplying a legacy name.
create function public.read_schedule_client_view(token_hash text,legacy_name text default null,legacy_expires bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;sched uuid;creator uuid;org uuid;hits integer;t timestamptz:=clock_timestamp();
begin
 update private.client_view_rate set hits=case when window_at<t-interval '1 minute' then 1 else client_view_rate.hits+1 end,window_at=case when window_at<t-interval '1 minute' then t else window_at end where id returning client_view_rate.hits into hits;
 if hits>240 then return jsonb_build_object('limited',true);end if;
 if legacy_name is null then
  select schedule_id,creator_id,organization_id into sched,creator,org from private.schedule_client_links l where l.token_hash=read_schedule_client_view.token_hash and revoked_at is null and expires_at>t;
 else
  if legacy_expires is null or legacy_expires<=extract(epoch from t) or legacy_expires>extract(epoch from t)+2592000 then return null;end if;
  select schedule_id,creator_id,organization_id into sched,creator,org from private.schedule_client_aliases a where a.legacy_name=read_schedule_client_view.legacy_name and revoked_at is null;
 end if;
 if sched is null then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 -- Recheck grant after lock wait: subsequent requests cannot revive a revoked link.
 if legacy_name is null then
  if not exists(select 1 from private.schedule_client_links l where l.token_hash=read_schedule_client_view.token_hash and revoked_at is null and expires_at>clock_timestamp()) then return null;end if;
 elsif not exists(select 1 from private.schedule_client_aliases a where a.legacy_name=read_schedule_client_view.legacy_name and revoked_at is null) or legacy_expires<=extract(epoch from clock_timestamp()) then return null;end if;
 select * into s from public.schedules where id=sched and organization_id=org;
 if s.id is null or not private.client_sponsor_allowed(creator,s) then return null;end if;
 return jsonb_build_object('name',s.display_name,'document',private.client_projection(s.document));
end;$$;
revoke all on function private.client_sponsor_allowed(uuid,public.schedules),private.client_can_revoke(uuid,uuid,public.schedules),private.client_pick(jsonb,text),private.client_projection(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_schedule_client_link(uuid,uuid,text,bigint),public.list_schedule_client_links(uuid,uuid),public.revoke_schedule_client_link(uuid,uuid,text),public.read_schedule_client_view(text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.create_schedule_client_link(uuid,uuid,text,bigint),public.list_schedule_client_links(uuid,uuid),public.revoke_schedule_client_link(uuid,uuid,text) to authenticated;
grant execute on function public.read_schedule_client_view(text,text,bigint) to service_role;
notify pgrst,'reload schema';

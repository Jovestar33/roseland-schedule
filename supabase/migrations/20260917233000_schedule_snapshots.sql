-- B05 snapshots are distinct from immutable saved-document history.
create table private.schedule_snapshots (
 id uuid primary key, organization_id uuid not null, schedule_id uuid not null,
 name text, kind text not null check(kind in ('named','automatic','imported')),
 document jsonb not null, template_bindings jsonb not null default '[]' check(jsonb_typeof(template_bindings)='array'),
 version bigint not null default 1 check(version>0), captured_at timestamptz not null default clock_timestamp(),
 deleted_at timestamptz, created_by uuid references auth.users(id), updated_by uuid references auth.users(id),
 updated_at timestamptz not null default clock_timestamp(), original_id text, original_order integer, original_payload jsonb,
 foreign key(organization_id,schedule_id) references public.schedules(organization_id,id) on delete restrict,
 check(kind<>'named' or name is not null), check(kind<>'imported' or original_id is not null)
);
create index schedule_snapshots_scope on private.schedule_snapshots(schedule_id,id);
create table private.schedule_snapshot_policy (
 organization_id uuid primary key references public.organizations(id), version bigint not null,
 retention_days integer check(retention_days between 1 and 36500),
 trash_min_role text not null default 'organizer' check(trash_min_role in ('editor','organizer','admin')),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table private.schedule_snapshot_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id),
 schedule_id uuid not null references public.schedules(id), snapshot_id uuid not null,
 actor_id uuid not null references auth.users(id), fingerprint text not null, result jsonb not null,
 created_at timestamptz not null default now()
);
-- No FK from receipts to snapshots: confirmed purge retains only result metadata.
alter table private.schedule_snapshots enable row level security;
alter table private.schedule_snapshot_policy enable row level security;
alter table private.schedule_snapshot_receipts enable row level security;
revoke all on private.schedule_snapshots,private.schedule_snapshot_policy,private.schedule_snapshot_receipts from public,anon,authenticated,service_role;

create function private.snapshot_actor_can(actor uuid,snapshot_id uuid,action text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare x private.schedule_snapshots; s public.schedules; org_role text; prod_role text; minimum text;
begin
 if actor is null or action is null or action not in ('read','edit','trash','purge','copy') then return false; end if;
 select * into x from private.schedule_snapshots where id=snapshot_id;
 if not found then return false; end if;
 select * into s from public.schedules where id=x.schedule_id;
 if not private.schedule_actor_can(actor,'history',s.organization_id,s.production_id,s.id)
  or not private.schedule_actor_can(actor,case when action='read' then 'read' when action='copy' then 'create' else 'edit' end,s.organization_id,s.production_id,s.id) then return false; end if;
 if exists(select 1 from jsonb_array_elements(x.template_bindings) b where not private.template_contexts_allow(actor,case when action='copy' then 'export' else action end,x.organization_id,b->'contexts')) then return false; end if;
 if action='copy' and not private.schedule_actor_can(actor,'export',s.organization_id,s.production_id,s.id) then return false; end if;
 if action in ('trash','purge') then
  if private.schedule_context_denied(actor,'trash',s.organization_id,s.production_id,s.id,null) then return false; end if;
  select role::text into org_role from public.organization_memberships where organization_id=s.organization_id and user_id=actor and status='active';
  if action='purge' then return org_role in ('owner','admin'); end if;
  select role::text into prod_role from public.production_memberships where production_id=s.production_id and user_id=actor and status='active';
  select trash_min_role into minimum from private.schedule_snapshot_policy where organization_id=s.organization_id;
  return org_role in ('owner','admin') or (coalesce(minimum,'organizer')='organizer' and prod_role='organizer') or (minimum='editor' and prod_role in ('editor','organizer'));
 end if;
 return true;
end;$$;
revoke all on function private.snapshot_actor_can(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.list_schedule_snapshots(target_schedule_id uuid,include_deleted boolean default false,after_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select x.id,x.organization_id,x.schedule_id,x.name,x.kind,x.version,x.captured_at,x.deleted_at,x.original_id,x.original_order,
   jsonb_array_length(x.document->'rows') row_count,
   private.snapshot_actor_can(auth.uid(),x.id,'edit') can_name,private.snapshot_actor_can(auth.uid(),x.id,'trash') can_trash,
   private.snapshot_actor_can(auth.uid(),x.id,'purge') can_purge
  from private.schedule_snapshots x where x.schedule_id=target_schedule_id and (x.deleted_at is not null)=include_deleted
   and (after_id is null or x.id>after_id) and private.snapshot_actor_can(auth.uid(),x.id,'read') order by x.id limit 100
 ) page;
$$;
create function public.read_schedule_snapshot(target_snapshot_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare x private.schedule_snapshots;
begin
 if not private.snapshot_actor_can(auth.uid(),target_snapshot_id,'read') then raise sqlstate 'PT404' using message='Snapshot unavailable'; end if;
 select * into x from private.schedule_snapshots where id=target_snapshot_id;
 return jsonb_build_object('id',x.id,'organization_id',x.organization_id,'schedule_id',x.schedule_id,'name',x.name,'kind',x.kind,
  'version',x.version,'captured_at',x.captured_at,'deleted_at',x.deleted_at,'document',x.document,'original_id',x.original_id,'original_order',x.original_order,
  'row_count',jsonb_array_length(x.document->'rows'),'can_name',private.snapshot_actor_can(auth.uid(),x.id,'edit'),
  'can_trash',private.snapshot_actor_can(auth.uid(),x.id,'trash'),'can_purge',private.snapshot_actor_can(auth.uid(),x.id,'purge'));
end;$$;

create function public.mutate_schedule_snapshot(request_id uuid,target_snapshot_id uuid,target_schedule_id uuid,expected_version bigint,
 operation text,next_name text default null,next_document jsonb default null,source_version bigint default null,
 automatic boolean default false,template_uses jsonb default '[]',confirmed_purge boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules; x private.schedule_snapshots; receipt private.schedule_snapshot_receipts; fp text; result jsonb;
 bindings jsonb; item jsonb; reviewed jsonb; t private.schedule_templates; contexts jsonb; restored jsonb;
begin
 perform public.require_active_schedule_session();
 if request_id is null or target_snapshot_id is null or target_schedule_id is null or expected_version is null or expected_version<0 or expected_version>=9007199254740991
  or operation is null or operation not in ('capture','name','trash','restore_trash','purge','restore_content') or automatic is null or confirmed_purge is null
  or template_uses is null or jsonb_typeof(template_uses)<>'array' or jsonb_array_length(template_uses)>100 then raise sqlstate 'PT400' using message='Invalid snapshot request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('snapshot-request:'||request_id::text,0));
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 select * into s from public.schedules where id=target_schedule_id for update;
 if not private.schedule_actor_can(auth.uid(),'edit',s.organization_id,s.production_id,s.id)
  or not private.schedule_actor_can(auth.uid(),'history',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Snapshot operation unavailable'; end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(target_snapshot_id,target_schedule_id,expected_version,operation,next_name,next_document,source_version,automatic,template_uses,confirmed_purge));
 select * into receipt from private.schedule_snapshot_receipts r where r.request_id=mutate_schedule_snapshot.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.schedule_id<>s.id or receipt.snapshot_id<>target_snapshot_id or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Snapshot request already used'; end if;
  return receipt.result;
 end if;
 select * into x from private.schedule_snapshots where id=target_snapshot_id for update;
 if operation='capture' then
  if x.id is not null or expected_version<>0 then raise sqlstate 'PT409' using message='Snapshot already exists'; end if;
  if s.document_version is distinct from source_version then raise sqlstate 'PT409' using message='Schedule changed; keep your draft and review'; end if;
  if (automatic and next_name is not null) or (not automatic and (next_name is null or length(btrim(next_name)) not between 1 and 150 or next_name ~ '[[:cntrl:]]')) then raise sqlstate 'PT400' using message='Choose a snapshot name'; end if;
  perform private.validate_schedule_document(next_document,1);
  select coalesce(jsonb_agg(jsonb_build_object('id',b.template_id,'fingerprint',b.fingerprint,'contexts',b.contexts) order by b.template_id,b.fingerprint),'[]') into bindings from private.schedule_template_bindings b where b.schedule_id=s.id;
  for item in select value from jsonb_array_elements(template_uses) loop
   if jsonb_typeof(item)<>'object' or item-array['id','version','policy']<>'{}' then raise sqlstate 'PT400' using message='Invalid template source'; end if;
   reviewed:=public.review_schedule_template_apply((item->>'id')::uuid,s.id);
   if (reviewed->'template'->>'version')::bigint is distinct from (item->>'version')::bigint or reviewed->>'policy' is distinct from item->>'policy' then raise sqlstate 'PT409' using message='Template source changed; retain draft'; end if;
   select * into t from private.schedule_templates where id=(item->>'id')::uuid;
   contexts:=private.template_apply_contexts(t);
   bindings:=bindings||jsonb_build_array(jsonb_build_object('id',t.id,'fingerprint',private.workflow_fingerprint(contexts),'contexts',contexts));
  end loop;
  insert into private.schedule_snapshots(id,organization_id,schedule_id,name,kind,document,template_bindings,created_by,updated_by)
   values(target_snapshot_id,s.organization_id,s.id,case when automatic then null else btrim(next_name) end,case when automatic then 'automatic' else 'named' end,next_document,bindings,auth.uid(),auth.uid());
 else
  if x.id is null or x.schedule_id<>s.id or not private.snapshot_actor_can(auth.uid(),x.id,case when operation='purge' then 'purge' when operation in ('trash','restore_trash') then 'trash' else 'edit' end) then raise sqlstate 'PT404' using message='Snapshot operation unavailable'; end if;
  if x.version<>expected_version then raise sqlstate 'PT409' using message='Snapshot changed; refresh and review'; end if;
  if (operation in ('trash','name','restore_content') and x.deleted_at is not null) or (operation in ('restore_trash','purge') and x.deleted_at is null) then raise sqlstate 'PT409' using message='Snapshot state changed'; end if;
  if operation='name' and (next_name is null or length(btrim(next_name)) not between 1 and 150 or next_name ~ '[[:cntrl:]]') then raise sqlstate 'PT400' using message='Choose a snapshot name'; end if;
  if operation='purge' and not confirmed_purge then raise sqlstate 'PT400' using message='Confirm permanent snapshot deletion'; end if;
  if operation='restore_content' then
   if s.document_version is distinct from source_version then raise sqlstate 'PT409' using message='Schedule changed; keep newer edits'; end if;
   for item in select value from jsonb_array_elements(x.template_bindings) loop
    insert into private.schedule_template_bindings values(s.id,(item->>'id')::uuid,item->>'fingerprint',item->'contexts') on conflict do nothing;
   end loop;
   restored:=public.update_schedule_document(s.id,source_version,private.destination_document(x.document,s.production_id,s.production_day_id,s.phase_id),1);
  end if;
  if operation='purge' then delete from private.schedule_snapshots where id=x.id;
  else update private.schedule_snapshots set name=case when operation='name' then btrim(next_name) else name end,
   kind=case when operation='name' and kind='automatic' then 'named' else kind end,
   deleted_at=case when operation='trash' then clock_timestamp() when operation='restore_trash' then null else deleted_at end,
   version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=x.id;
  end if;
 end if;
 result:=jsonb_build_object('confirmed',true,'request_id',request_id,'id',target_snapshot_id,'operation',operation,'version',expected_version+1);
 if operation='restore_content' then result:=result||jsonb_build_object('schedule_version',source_version+1); end if;
 insert into private.schedule_snapshot_receipts(request_id,organization_id,schedule_id,snapshot_id,actor_id,fingerprint,result) values(request_id,s.organization_id,s.id,target_snapshot_id,auth.uid(),fp,result);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(s.organization_id,auth.uid(),'snapshot.'||operation,'schedule_snapshot',target_snapshot_id,jsonb_build_object('schedule_id',s.id,'version',expected_version+1,'request_id',request_id));
 return result;
end;$$;
create function public.check_schedule_snapshot_request(request_id uuid,target_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules; receipt private.schedule_snapshot_receipts;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id;
 if not found or not private.schedule_actor_can(auth.uid(),'history',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Snapshot result unavailable'; end if;
 select * into receipt from private.schedule_snapshot_receipts r where r.request_id=check_schedule_snapshot_request.request_id and r.actor_id=auth.uid() and r.schedule_id=s.id;
 if not found then return jsonb_build_object('confirmed',false); end if;
 return receipt.result;
end;$$;

create function public.expire_schedule_snapshots(target_schedule_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare s public.schedules; policy private.schedule_snapshot_policy; x private.schedule_snapshots; total integer:=0;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 if not private.schedule_actor_can(auth.uid(),'history',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Snapshots unavailable'; end if;
 select * into policy from private.schedule_snapshot_policy where organization_id=s.organization_id;
 if policy.retention_days is null then return 0; end if;
 for x in select * from private.schedule_snapshots where schedule_id=s.id and kind='automatic' and name is null and deleted_at is null
  and captured_at<=clock_timestamp()-make_interval(days=>policy.retention_days) order by id for update loop
  if not private.snapshot_actor_can(auth.uid(),x.id,'read') then continue; end if;
  update private.schedule_snapshots set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=x.id;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(s.organization_id,auth.uid(),'snapshot.retention_trash','schedule_snapshot',x.id,jsonb_build_object('policy_version',policy.version,'retention_days',policy.retention_days));
  total:=total+1;
 end loop;
 return total;
end;$$;

revoke all on function public.list_schedule_snapshots(uuid,boolean,uuid),public.read_schedule_snapshot(uuid),
 public.mutate_schedule_snapshot(uuid,uuid,uuid,bigint,text,text,jsonb,bigint,boolean,jsonb,boolean),public.check_schedule_snapshot_request(uuid,uuid),public.expire_schedule_snapshots(uuid) from public,anon,service_role;
grant execute on function public.list_schedule_snapshots(uuid,boolean,uuid),public.read_schedule_snapshot(uuid),
 public.mutate_schedule_snapshot(uuid,uuid,uuid,bigint,text,text,jsonb,bigint,boolean,jsonb,boolean),public.check_schedule_snapshot_request(uuid,uuid),public.expire_schedule_snapshots(uuid) to authenticated;
notify pgrst,'reload schema';

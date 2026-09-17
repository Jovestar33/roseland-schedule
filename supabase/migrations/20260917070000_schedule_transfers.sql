-- Stable history identity; historical production provenance is never rewritten.
alter table public.schedules add constraint schedules_org_id_unique unique(organization_id,id);
alter table public.schedule_versions drop constraint schedule_versions_schedule_fk;
alter table public.schedule_versions add constraint schedule_versions_schedule_fk foreign key(organization_id,schedule_id) references public.schedules(organization_id,id) on delete restrict;
-- Defer only this current-placement FK while the schedule and its explicit rules move atomically.
DO $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.schedule_restrictions'::regclass and confrelid='public.schedules'::regclass loop execute format('alter table public.schedule_restrictions drop constraint %I',c.conname); end loop;
end $$;
alter table public.schedule_restrictions add constraint schedule_restrictions_schedule_fk foreign key(organization_id,production_id,schedule_id) references public.schedules(organization_id,production_id,id) on delete no action deferrable initially deferred;

create table private.schedule_transfer_writes(
 transaction_id bigint not null, schedule_id uuid not null, actor_id uuid not null, source_id uuid not null, destination_id uuid not null, expected_version bigint not null,
 primary key(transaction_id,schedule_id)
);
create table private.schedule_transfers(
 id uuid primary key, organization_id uuid not null references public.organizations(id), schedule_id uuid not null references public.schedules(id),
 source_id uuid not null references public.productions(id), destination_id uuid not null references public.productions(id), requester uuid not null references auth.users(id),
 decision_fingerprint text, status text not null check(status in ('pending','approved','cancelled','declined')), fingerprint text not null,
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days',
 decided_by uuid references auth.users(id),decided_at timestamptz,result_version bigint,
 check(source_id<>destination_id)
);
revoke all on private.schedule_transfer_writes,private.schedule_transfers from public,anon,authenticated,service_role;

-- Context-specific restrictions for discovery and approved-request disclosure.
-- This does not grant production access, history access, or a general read bypass.
create function private.schedule_context_denied(actor uuid,action text,org uuid,prod uuid,sched uuid,context_role text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.schedule_restrictions r
 join public.organization_memberships m on m.organization_id=r.organization_id and m.user_id=actor
 left join public.production_memberships pm on pm.production_id=prod and pm.user_id=actor and pm.status='active'
 where r.organization_id=org and (r.production_id is null or r.production_id=prod) and (r.schedule_id is null or r.schedule_id=sched)
 and (r.subject_user_id=actor or r.subject_role in ('everyone',m.role::text)
  or (m.role='member' and r.subject_role in (pm.role::text,context_role)))
 and (action=any(r.denied_actions) or (action<>'discover' and 'read'=any(r.denied_actions))));
$$;
create function private.transfer_stamp(s public.schedules,destination uuid)
returns text language sql stable security definer set search_path='' as $$
 select private.workflow_fingerprint(jsonb_build_array(private.schedule_policy_stamp(s.organization_id,s.production_id,s.id),private.schedule_policy_stamp(s.organization_id,destination,null)));
$$;
create function private.destination_document(doc jsonb,prod uuid,day uuid,phase uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_set(jsonb_set(doc,'{meta,projectName}',to_jsonb(p.name),true),'{meta,phase}',to_jsonb(coalesce(f.name,'')),true)
 from public.productions p left join public.production_days d on d.id=day left join public.phases f on f.id=case when day is null then phase else d.phase_id end where p.id=prod;
$$;
create function private.transfer_write_allowed(s public.schedules,destination uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.schedule_transfer_writes w where w.transaction_id=txid_current() and w.schedule_id=s.id and w.actor_id=auth.uid() and w.source_id=s.production_id and w.destination_id=destination and w.expected_version=s.document_version);
$$;
create or replace function public.protect_schedule_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or (new.production_id is distinct from old.production_id and not private.transfer_write_allowed(old,new.production_id))
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
  if private.transfer_write_allowed(old,new.production_id) then return new; end if;
  action := case when new.deleted_at is distinct from old.deleted_at then 'trash'
   when new.display_name is distinct from old.display_name or new.slug is distinct from old.slug or new.status is distinct from old.status
    or new.production_day_id is distinct from old.production_day_id or new.phase_id is distinct from old.phase_id or new.library_position is distinct from old.library_position then 'organize' else 'edit' end;
  if not private.schedule_actor_can(auth.uid(),action,old.organization_id,old.production_id,old.id) then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 end if;
 return new;
end; $$;


create function public.schedule_transfer_destinations(target_schedule_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.schedules;result jsonb;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found or s.deleted_at is not null or not public.schedule_visible(s.id,'transfer') then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'direct',public.schedule_capability('transfer',p.id) and public.schedule_capability('organize',p.id) and public.schedule_capability('create',p.id)) order by p.name,p.id),'[]') into result
 from public.productions p where p.organization_id=s.organization_id and p.id<>s.production_id and p.deleted_at is null
 and private.schedule_actor_can(auth.uid(),'discover',s.organization_id,p.id,null)
 and not private.schedule_context_denied(auth.uid(),'transfer',s.organization_id,p.id,null,'organizer');
 return result;
end; $$;
create function public.review_schedule_transfer(target_schedule_id uuid,target_production_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.schedules;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found or s.deleted_at is not null or not public.schedule_visible(s.id,'transfer')
 or not exists(select 1 from public.productions p where p.id=target_production_id and p.organization_id=s.organization_id and p.deleted_at is null)
 or not private.schedule_actor_can(auth.uid(),'discover',s.organization_id,target_production_id,null)
 or private.schedule_context_denied(auth.uid(),'transfer',s.organization_id,target_production_id,null,'organizer') then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
 return jsonb_build_object('schedule',to_jsonb(s),'policy',private.transfer_stamp(s,target_production_id));
end; $$;
create function private.receiver_can_review(t private.schedule_transfers,actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare s public.schedules;
begin
 if t.status<>'pending' or t.expires_at<=clock_timestamp() then return false; end if;
 select * into s from public.schedules where id=t.schedule_id;
 return found and s.deleted_at is null and s.production_id=t.source_id
 and private.schedule_actor_can(t.requester,'transfer',t.organization_id,t.source_id,t.schedule_id)
 and private.schedule_actor_can(actor,'organize',t.organization_id,t.destination_id,null)
 and private.schedule_actor_can(actor,'transfer',t.organization_id,t.destination_id,null)
 and private.schedule_actor_can(actor,'create',t.organization_id,t.destination_id,null)
 and not private.schedule_context_denied(actor,'read',t.organization_id,t.source_id,t.schedule_id,'organizer')
 and not private.schedule_context_denied(actor,'transfer',t.organization_id,t.source_id,t.schedule_id,'organizer');
end; $$;
create function public.request_schedule_transfer(request_id uuid,target_schedule_id uuid,target_production_id uuid,expected_version bigint,expected_policy text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;t private.schedule_transfers;fp text;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 perform private.lock_schedule_permissions(s.organization_id,target_production_id);
 fp:=private.workflow_fingerprint(jsonb_build_array(target_schedule_id,target_production_id,expected_version,expected_policy));
 select * into t from private.schedule_transfers where id=request_id;
 if found then
  if t.requester<>auth.uid() or t.fingerprint<>fp or not private.schedule_actor_can(auth.uid(),'discover',t.organization_id) then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
  return jsonb_build_object('id',t.id,'status',t.status,'version',t.result_version);
 end if;
 perform public.review_schedule_transfer(target_schedule_id,target_production_id);
 select * into s from public.schedules where id=target_schedule_id for update;
 if expected_version is distinct from s.document_version or expected_policy is distinct from private.transfer_stamp(s,target_production_id) then raise sqlstate 'PT409' using message='Schedule or policy changed; review again';end if;
 insert into private.schedule_transfers(id,organization_id,schedule_id,source_id,destination_id,requester,status,fingerprint)
 values(request_id,s.organization_id,s.id,s.production_id,target_production_id,auth.uid(),'pending',fp);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(s.organization_id,auth.uid(),'schedule.transfer.request','schedule',s.id,jsonb_build_object('request',request_id,'destination',target_production_id));
 return jsonb_build_object('id',request_id,'status','pending');
end; $$;
create function public.list_schedule_transfers(target_organization_id uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'schedule_id',t.schedule_id,'source',p.name,'destination',d.name,'destination_id',t.destination_id,
 'status',case when t.status='pending' and t.expires_at<=clock_timestamp() then 'expired' else t.status end,'expires_at',t.expires_at,'outgoing',t.requester=auth.uid(),'reviewable',private.receiver_can_review(t,auth.uid())) order by t.created_at desc),'[]')
 from private.schedule_transfers t join public.productions p on p.id=t.source_id join public.productions d on d.id=t.destination_id
 where t.organization_id=target_organization_id and private.schedule_actor_can(auth.uid(),'discover',t.organization_id)
 and ((t.requester=auth.uid() and private.schedule_actor_can(auth.uid(),'transfer',t.organization_id,t.source_id,null)) or private.receiver_can_review(t,auth.uid()));
$$;
create function public.preview_schedule_transfer(request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare t private.schedule_transfers;s public.schedules;
begin
 select * into t from private.schedule_transfers where id=request_id;
 if not found or not private.receiver_can_review(t,auth.uid()) then raise sqlstate 'PT404' using message='Preview unavailable';end if;
 select * into s from public.schedules where id=t.schedule_id;
 return jsonb_build_object('id',t.id,'schedule',to_jsonb(s),'policy',private.transfer_stamp(s,t.destination_id),'destination_id',t.destination_id);
end; $$;
create function public.close_schedule_transfer(request_id uuid,decision text)
returns void language plpgsql security definer set search_path='' as $$
declare t private.schedule_transfers;
begin
 select * into t from private.schedule_transfers where id=request_id;
 if not found then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
 perform private.lock_schedule_permissions(t.organization_id,t.source_id);
 perform private.lock_schedule_permissions(t.organization_id,t.destination_id);
 select * into t from private.schedule_transfers where id=request_id for update;
 if t.status<>'pending' or decision not in ('cancelled','declined') or not private.schedule_actor_can(auth.uid(),'discover',t.organization_id)
 or (decision='cancelled' and auth.uid()<>t.requester) or (decision='declined' and not private.receiver_can_review(t,auth.uid())) then raise sqlstate 'PT404' using message='Transfer unavailable';end if;
 update private.schedule_transfers set status=decision,decided_at=now(),decided_by=auth.uid() where id=request_id;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(t.organization_id,auth.uid(),'schedule.transfer.'||decision,'schedule',t.schedule_id,jsonb_build_object('request',request_id));
end; $$;

create function public.move_schedule(request_id uuid,target_schedule_id uuid,target_production_id uuid,target_day_id uuid,target_phase_id uuid,expected_version bigint,expected_policy text,approve_request boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;t private.schedule_transfers;result public.schedules;fp text;original_source uuid;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Move unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 perform private.lock_schedule_placement(target_production_id,target_day_id,target_phase_id);
 if not exists(select 1 from public.productions where id=target_production_id and organization_id=s.organization_id) then raise sqlstate 'PT404' using message='Move unavailable';end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(target_schedule_id,target_production_id,target_day_id,target_phase_id,expected_version,expected_policy,approve_request));
 select * into t from private.schedule_transfers where id=request_id for update;
 if found and t.status='approved' then
  if t.decided_by<>auth.uid() or t.decision_fingerprint<>fp or not public.schedule_visible(target_schedule_id,'read') then raise sqlstate 'PT404' using message='Move unavailable';end if;
  return jsonb_build_object('id',t.id,'schedule_id',s.id,'status','approved','version',t.result_version);
 end if;
 select * into s from public.schedules where id=target_schedule_id for update;
 if approve_request then
  perform 1 from public.organization_memberships where organization_id=t.organization_id and user_id=t.requester for share;
  perform 1 from public.production_memberships where production_id=t.source_id and user_id=t.requester for share;
  if t.id is null or t.schedule_id<>s.id or t.destination_id<>target_production_id or not private.receiver_can_review(t,auth.uid()) then raise sqlstate 'PT404' using message='Move unavailable';end if;
 else
  if t.id is not null or not public.schedule_visible(s.id,'transfer') or not public.schedule_capability('organize',target_production_id)
   or not public.schedule_capability('transfer',target_production_id) or not public.schedule_capability('create',target_production_id) then raise sqlstate 'PT404' using message='Move unavailable';end if;
 end if;
 if s.deleted_at is not null or s.production_id=target_production_id then raise sqlstate 'PT400' using message='Choose another production';end if;
 if expected_version is distinct from s.document_version or expected_policy is distinct from private.transfer_stamp(s,target_production_id) then raise sqlstate 'PT409' using message='Schedule or policy changed; review again';end if;
 perform private.lock_schedule_placement(s.production_id,s.production_day_id,s.phase_id);
 original_source:=s.production_id;
 insert into private.schedule_transfer_writes values(txid_current(),s.id,auth.uid(),s.production_id,target_production_id,s.document_version);
 update public.schedules set production_id=target_production_id,production_day_id=target_day_id,phase_id=case when target_day_id is null then target_phase_id else null end,
 document=private.destination_document(s.document,target_production_id,target_day_id,target_phase_id),library_position=(select coalesce(max(library_position),0)+1 from public.schedules where production_id=target_production_id)
 where id=s.id returning * into result;
 update public.schedule_restrictions set production_id=target_production_id where schedule_id=s.id;
 delete from private.schedule_transfer_writes where transaction_id=txid_current() and schedule_id=s.id;
 if not public.schedule_visible(s.id,'edit') or not public.schedule_visible(s.id,'transfer') then raise sqlstate 'PT404' using message='Move cannot preserve destination access';end if;
 if approve_request then
  update private.schedule_transfers set status='approved',decision_fingerprint=fp,decided_by=auth.uid(),decided_at=now(),result_version=result.document_version where id=request_id;
 else
  insert into private.schedule_transfers(id,organization_id,schedule_id,source_id,destination_id,requester,status,fingerprint,decision_fingerprint,decided_by,decided_at,result_version)
  values(request_id,s.organization_id,s.id,original_source,target_production_id,auth.uid(),'approved',fp,fp,auth.uid(),now(),result.document_version);
 end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(s.organization_id,auth.uid(),'schedule.move','schedule',s.id,jsonb_build_object('request',request_id,'source',original_source,'destination',target_production_id,'from_version',expected_version,'version',result.document_version));
 return jsonb_build_object('id',request_id,'schedule_id',s.id,'status','approved','version',result.document_version);
exception when unique_violation then raise sqlstate 'PT409' using message='Destination address or request already exists; review again';
end; $$;
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
    update public.schedules set document=case when exists(select 1 from private.schedule_transfers t where t.schedule_id=old_row.id and t.status='approved' and t.result_version>source.version) then private.destination_document(source.document,old_row.production_id,old_row.production_day_id,old_row.phase_id) else source.document end,document_schema_version=source.document_schema_version,
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

create function public.review_schedule_copy(target_schedule_id uuid,target_production_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.schedules;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found or s.deleted_at is not null or not public.schedule_visible(s.id,'create')
 or not exists(select 1 from public.productions where id=target_production_id and organization_id=s.organization_id and deleted_at is null)
 or not public.schedule_capability('create',target_production_id) then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 return jsonb_build_object('schedule',to_jsonb(s),'policy',private.transfer_stamp(s,target_production_id));
end; $$;

-- New nullable-placement copy uses an exact creator-bound receipt and retains explicit rules.
create function public.copy_schedule_to_production(target_schedule_id uuid,source_schedule_id uuid,source_version bigint,source_policy text,
 target_production_id uuid,target_day_id uuid,target_phase_id uuid,next_display_name text,next_slug text,next_document jsonb,schema_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;doc jsonb;fp text;
begin
 select * into s from public.schedules where id=source_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 perform private.lock_schedule_placement(target_production_id,target_day_id,target_phase_id);
 if not exists(select 1 from public.productions where id=target_production_id and organization_id=s.organization_id) then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(source_schedule_id,source_version,source_policy,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug,next_document,schema_version));
 if exists(select 1 from private.schedule_copy_receipts where schedule_id=target_schedule_id) then
  if not exists(select 1 from private.schedule_copy_receipts where schedule_id=target_schedule_id and actor_id=auth.uid() and fingerprint=fp) or not public.schedule_visible(target_schedule_id,'read') then raise sqlstate 'PT404' using message='Copy unavailable';end if;
  return jsonb_build_object('id',target_schedule_id,'status','confirmed','version',1);
 end if;
 select * into s from public.schedules where id=source_schedule_id for share;
 if s.deleted_at is not null or not public.schedule_visible(s.id,'create') or not public.schedule_capability('create',target_production_id) then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 if s.document_version is distinct from source_version or source_policy is distinct from private.transfer_stamp(s,target_production_id) then raise sqlstate 'PT409' using message='Source or permissions changed; review again';end if;
 doc:=private.destination_document(next_document,target_production_id,target_day_id,target_phase_id);
 perform public.create_schedule_in_production(target_schedule_id,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug,doc,schema_version);
 insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
 select organization_id,target_production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by from public.schedule_restrictions where schedule_id=s.id;
 if not public.schedule_visible(target_schedule_id,'edit') then raise sqlstate 'PT404' using message='Copy cannot preserve editable access';end if;
 insert into private.schedule_copy_receipts(schedule_id,actor_id,fingerprint) values(target_schedule_id,auth.uid(),fp);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(s.organization_id,auth.uid(),'schedule.copy','schedule',target_schedule_id,jsonb_build_object('source_id',s.id,'source_version',s.document_version));
 return jsonb_build_object('id',target_schedule_id,'status','confirmed','version',1);
end; $$;
DO $$ declare f record;begin
 for f in select p.oid::regprocedure as sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='private' and p.proname in ('schedule_context_denied','transfer_stamp','destination_document','transfer_write_allowed','receiver_can_review'))
 or (n.nspname='public' and p.proname in ('review_schedule_copy','schedule_transfer_destinations','review_schedule_transfer','request_schedule_transfer','list_schedule_transfers','preview_schedule_transfer','close_schedule_transfer','move_schedule','copy_schedule_to_production')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;

-- Current placement labels support an exact review of restoring pre-Move history.
create or replace function public.read_schedule(target_schedule_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.schedules;labels jsonb;last_move bigint;
begin
 if auth.uid() is null then raise sqlstate 'PT401' using message='Authentication required';end if;
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null;
 if not found or not public.schedule_visible(s.id,'read') then raise sqlstate 'PT404' using message='Schedule unavailable';end if;
 labels:=private.destination_document('{"meta":{},"rows":[]}'::jsonb,s.production_id,s.production_day_id,s.phase_id)->'meta';
 select max(result_version) into last_move from private.schedule_transfers where schedule_id=s.id and status='approved';
 return to_jsonb(s)||jsonb_build_object('destination_labels',labels,'last_transfer_version',coalesce(last_move,0));
end; $$;

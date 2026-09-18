-- B10-B: reversible 30-day request/cancellation. No purge implementation.
create table private.organization_lifecycle (
 organization_id uuid primary key references public.organizations(id),version bigint not null check(version>0),
 deletion_request_id uuid not null,requested_by uuid not null references auth.users(id),requested_at timestamptz not null,
 cancel_before timestamptz not null,cancelled_by uuid references auth.users(id),cancelled_at timestamptz,
 check(cancel_before=requested_at+interval '30 days'),check((cancelled_by is null)=(cancelled_at is null))
);
create table private.organization_lifecycle_receipts (
 request_id uuid primary key,organization_id uuid not null references public.organizations(id),actor_id uuid not null references auth.users(id),fingerprint text not null,result jsonb not null
);
create index organization_lifecycle_requester on private.organization_lifecycle(requested_by);
create index organization_lifecycle_canceller on private.organization_lifecycle(cancelled_by);
create index organization_lifecycle_receipts_org on private.organization_lifecycle_receipts(organization_id);
create index organization_lifecycle_receipts_actor on private.organization_lifecycle_receipts(actor_id);
alter table private.organization_lifecycle enable row level security;
alter table private.organization_lifecycle_receipts enable row level security;
revoke all on private.organization_lifecycle,private.organization_lifecycle_receipts from public,anon,authenticated,service_role;

create function private.organization_writable(org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.organization_lifecycle where organization_id=org and cancelled_at is null);
$$;
create function private.require_organization_writable(org uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if org is null then return; end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 if not private.organization_writable(org) then raise sqlstate 'PT423' using message='organization_read_only'; end if;
end;$$;
-- Shared guard covers ordinary writes through both direct tables and definer RPCs.
create function private.guard_organization_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb; orgs uuid[]:='{}'; org uuid; value uuid;
begin
 if tg_table_schema='public' and tg_table_name='organizations' and tg_op='UPDATE' and new.deleted_at is distinct from old.deleted_at then
  raise sqlstate 'PT403' using message='Use the organization deletion request workflow';
 end if;
 if tg_table_schema='public' and tg_table_name='organizations' and tg_op='DELETE' then
  raise sqlstate 'PT403' using message='Organization purge is not implemented';
 end if;
 for r in select to_jsonb(old) where tg_op<>'INSERT' union all select to_jsonb(new) where tg_op<>'DELETE' loop
  if r ? 'organization_id' then orgs:=array_append(orgs,(r->>'organization_id')::uuid); end if;
  if tg_table_name='organizations' then orgs:=array_append(orgs,(r->>'id')::uuid); end if;
  if r ? 'schedule_id' then select organization_id into org from public.schedules where id=(r->>'schedule_id')::uuid;orgs:=array_append(orgs,org);end if;
  if r ? 'template_id' then select organization_id into org from private.schedule_templates where id=(r->>'template_id')::uuid;orgs:=array_append(orgs,org);end if;
  if tg_table_name in ('schedule_transfers','schedule_transfer_writes') then
   for value in select (r->>'source_id')::uuid union select (r->>'destination_id')::uuid loop
    select organization_id into org from public.productions where id=value;orgs:=array_append(orgs,org);
   end loop;
  end if;
  if tg_table_name='schedule_snapshot_imports' then
   select organization_id into org from private.migration_records where id=(r->>'source_record_id')::uuid;orgs:=array_append(orgs,org);
  end if;
 end loop;
 for org in select distinct x from unnest(orgs) x where x is not null order by x loop perform private.require_organization_writable(org);end loop;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
-- Explicit inventory: audit, account/session tables, delivery state and lifecycle ledgers are exceptions.
do $$declare target text; begin
 foreach target in array array[
 'public.organizations','public.organization_memberships','public.organization_invitations','public.productions','public.production_memberships',
 'public.phases','public.production_days','public.schedules','public.schedule_versions','public.schedule_restrictions',
 'private.migration_records','private.migration_record_versions','private.organization_presentation','private.organization_mfa_policy',
 'private.schedule_snapshot_policy','private.schedule_snapshots','private.schedule_snapshot_imports','private.schedule_templates',
 'private.schedule_template_sources','private.schedule_template_bindings','private.schedule_template_browser_origins','private.schedule_transfers','private.schedule_transfer_writes'
 ] loop execute format('create trigger a_organization_writable before insert or update or delete on %s for each row execute function private.guard_organization_write()',target);end loop;
end;$$;
-- Add early checks to write RPCs while retaining the shared lock for read-only receipt/review RPCs.
do $$declare f record; definition text; changed text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'assign_production_role','close_schedule_transfer','copy_schedule','copy_schedule_snapshot','copy_schedule_to_production','create_schedule',
 'create_schedule_in_production','expire_schedule_snapshots','import_browser_schedule_template','move_schedule','mutate_schedule',
 'mutate_schedule_snapshot','mutate_schedule_template','order_schedule_library','place_schedule','publish_schedule_template','request_schedule_transfer',
 'save_organization_mfa_policy','save_organization_presentation','save_schedule_with_templates','save_snapshot_policy','set_organization_member_status',
 'set_schedule_restriction','update_schedule_document']) loop
  definition:=pg_get_functiondef(f.oid);
  changed:=regexp_replace(definition,'(perform private.lock_schedule_permissions\(([^,;)]+)[^;]*\);)','\1 perform private.require_organization_writable(\2);','g');
  -- Some wrappers delegate to guarded functions; physical writes are covered by triggers above.
  if changed<>definition then execute changed;end if;
 end loop;
end;$$;
create or replace function private.schedule_actor_can(actor uuid,action text,org uuid,prod uuid default null,sched uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select public.mfa_organization_access(org) and private.schedule_actor_can_without_template_bindings(actor,action,org,prod,sched)
  and (action in ('discover','read','history','export','permissions') or private.organization_writable(org))
  and (sched is null or action in ('permissions','discover') or private.schedule_template_bindings_allow(actor,action,org,sched));
$$;

-- Extend the existing delivery ledger to one lifecycle event with multiple recipients.
alter table private.administration_notification_outbox drop constraint administration_notification_outbox_pkey;
alter table private.administration_notification_outbox drop constraint administration_notification_outbox_event_id_recipient_id_key;
alter table private.administration_notification_outbox add primary key(event_id,recipient_id);
alter table private.administration_notification_outbox alter membership_id drop not null;
alter table private.administration_notification_outbox alter next_status drop not null;
alter table private.administration_notification_outbox alter membership_revision drop not null;
alter table private.administration_notification_outbox add event_kind text not null default 'membership' check(event_kind in ('membership','deletion_requested','deletion_cancelled'));
alter table private.administration_notification_outbox add lifecycle_version bigint;
alter table private.administration_notification_outbox add cancel_before timestamptz;
alter table private.administration_notification_outbox add constraint notification_event_shape check(
 (event_kind='membership' and membership_id is not null and next_status is not null and membership_revision is not null and lifecycle_version is null)
 or (event_kind<>'membership' and membership_id is null and next_status is null and membership_revision is null and lifecycle_version is not null));
-- Preserve the membership-only endpoints after the ledger gains multiple recipients.
do $$declare f record; d text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_membership_notification','finish_membership_notification') loop
  d:=pg_get_functiondef(f.oid);
  d:=replace(d,'where event_id=p_event_id','where event_kind=''membership'' and event_id=p_event_id');
  execute d;
 end loop;
end;$$;

create function private.organization_lifecycle_owner(actor uuid,org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=actor and m.role='owner' and m.status='active' and o.deleted_at is null);
$$;
create function private.organization_lifecycle_result(org uuid,actor uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l private.organization_lifecycle; owner boolean; state text; now_at timestamptz:=clock_timestamp();
begin
 select * into l from private.organization_lifecycle where organization_id=org;
 owner:=private.organization_lifecycle_owner(actor,org);
 state:=case when l.organization_id is null or l.cancelled_at is not null then 'active' when now_at<l.cancel_before then 'pending_deletion' else 'awaiting_purge' end;
 return jsonb_build_object('organization_id',org,'version',coalesce(l.version,0),'state',state,'read_only',state<>'active',
  'cancel_before',case when owner and state<>'active' then l.cancel_before end,
  'can_request',owner and state='active' and private.schedule_actor_can(actor,'permissions',org),
  'can_cancel',owner and state='pending_deletion','can_manage',owner,
  'notifications',case when owner then (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.recipient_id),'[]') from (
   select event_id,recipient_id,event_kind,lifecycle_version,delivery_state,created_at from private.administration_notification_outbox
   where organization_id=org and event_kind<>'membership' and delivery_state<>'delivered' order by created_at,recipient_id limit 25
  )q) else '[]'::jsonb end);
end;$$;
create function public.read_organization_lifecycle(target_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();perform private.require_organization_mfa(target_organization_id);
 if not public.is_active_org_member(target_organization_id) then raise sqlstate 'PT404' using message='Organization unavailable';end if;
 return private.organization_lifecycle_result(target_organization_id,auth.uid());
end;$$;
create function private.change_organization_lifecycle(org uuid,request uuid,expected bigint,operation text,confirmed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();l private.organization_lifecycle;receipt private.organization_lifecycle_receipts;fp text;result jsonb;at_time timestamptz;
begin
 perform public.require_active_schedule_session();
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||org::text,0));
 perform private.require_organization_mfa(org);
 if not private.organization_lifecycle_owner(actor,org) then raise sqlstate 'PT404' using message='Organization lifecycle unavailable';end if;
 perform 1 from public.organization_memberships where organization_id=org and user_id=actor for share;
 perform private.require_recent_totp();
 if request is null or expected is null or expected<0 or expected>=9007199254740991 or operation not in ('request','cancel') or confirmed is distinct from true then raise sqlstate 'PT400' using message='Confirm the named organization';end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(org,expected,operation,confirmed));
 select * into receipt from private.organization_lifecycle_receipts where request_id=request;
 if found then
  if receipt.actor_id<>actor or receipt.organization_id<>org or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Request already used';end if;
  return receipt.result;
 end if;
 select * into l from private.organization_lifecycle where organization_id=org for update;
 if coalesce(l.version,0)<>expected then raise sqlstate 'PT409' using message='Lifecycle changed; review current state';end if;
 at_time:=clock_timestamp();
 if operation='request' then
  if not private.schedule_actor_can(actor,'permissions',org) then raise sqlstate 'PT404' using message='Organization lifecycle unavailable';end if;
  if l.organization_id is not null and l.cancelled_at is null then raise sqlstate 'PT409' using message='Deletion already requested';end if;
  insert into private.organization_lifecycle values(org,expected+1,request,actor,at_time,at_time+interval '30 days',null,null)
  on conflict(organization_id) do update set version=excluded.version,deletion_request_id=excluded.deletion_request_id,requested_by=excluded.requested_by,requested_at=excluded.requested_at,cancel_before=excluded.cancel_before,cancelled_by=null,cancelled_at=null;
 else
  -- Cancellation is an explicit any-active-Super-Admin exception, not ordinary write permission.
  if l.organization_id is null or l.cancelled_at is not null or at_time>=l.cancel_before then raise sqlstate 'PT409' using message='Cancellation window closed or no pending request';end if;
  update private.organization_lifecycle set version=expected+1,cancelled_by=actor,cancelled_at=at_time where organization_id=org;
 end if;
 insert into private.administration_notification_outbox(event_id,organization_id,recipient_id,actor_id,event_kind,lifecycle_version,cancel_before)
 select request,org,m.user_id,actor,case when operation='request' then 'deletion_requested' else 'deletion_cancelled' end,expected+1,case when operation='request' then at_time+interval '30 days' else l.cancel_before end
 from public.organization_memberships m where m.organization_id=org and m.role='owner' and m.status in ('active','suspended');
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(org,actor,'organization.deletion.'||operation,'organization',org,jsonb_build_object('version',expected+1,'request_id',request));
 result:=jsonb_build_object('confirmed',true,'request_id',request,'organization_id',org,'version',expected+1,'operation',operation);
 insert into private.organization_lifecycle_receipts values(request,org,actor,fp,result);
 return result;
end;$$;
create function public.request_organization_deletion(target_organization_id uuid,request_id uuid,expected_version bigint,confirmed boolean) returns jsonb
language sql security definer set search_path='' as $$select private.change_organization_lifecycle(target_organization_id,request_id,expected_version,'request',confirmed);$$;
create function public.cancel_organization_deletion(target_organization_id uuid,request_id uuid,expected_version bigint) returns jsonb
language sql security definer set search_path='' as $$select private.change_organization_lifecycle(target_organization_id,request_id,expected_version,'cancel',true);$$;
revoke all on function private.organization_writable(uuid),private.require_organization_writable(uuid),private.guard_organization_write(),private.organization_lifecycle_owner(uuid,uuid),private.organization_lifecycle_result(uuid,uuid),private.change_organization_lifecycle(uuid,uuid,bigint,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.read_organization_lifecycle(uuid),public.request_organization_deletion(uuid,uuid,bigint,boolean),public.cancel_organization_deletion(uuid,uuid,bigint) from public,anon,service_role;
grant execute on function public.read_organization_lifecycle(uuid),public.request_organization_deletion(uuid,uuid,bigint,boolean),public.cancel_organization_deletion(uuid,uuid,bigint) to authenticated;
notify pgrst,'reload schema';

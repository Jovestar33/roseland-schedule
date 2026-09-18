-- B10-A: explicit organization suspension/reinstatement. No Auth ban or role mutation API.
alter table public.organization_memberships add column revision bigint not null default 1 check(revision>0);
create table private.membership_status_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id), membership_id uuid not null references public.organization_memberships(id),
 fingerprint text not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table private.administration_notification_outbox (
 event_id uuid primary key, organization_id uuid not null references public.organizations(id),
 membership_id uuid not null references public.organization_memberships(id), recipient_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id), next_status text not null check(next_status in ('active','suspended')),
 membership_revision bigint not null, created_at timestamptz not null default clock_timestamp(),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','sending','delivered','failed')),
 attempts integer not null default 0, claim_id uuid, claimed_by uuid references auth.users(id), lease_until timestamptz,
 delivered_at timestamptz, last_error text, unique(event_id,recipient_id)
);
alter table private.membership_status_receipts enable row level security;
alter table private.administration_notification_outbox enable row level security;
revoke all on private.membership_status_receipts,private.administration_notification_outbox from public,anon,authenticated,service_role;

create function private.guard_organization_membership_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||old.organization_id::text,0));
 if tg_op='UPDATE' then
  if new.id<>old.id or new.organization_id<>old.organization_id or new.user_id<>old.user_id then
   raise sqlstate 'PT400' using message='Membership identity cannot change';
  end if;
  new.revision:=old.revision+1;
 end if;
 if old.role='owner' and old.status='active' then
  if tg_op='DELETE' or new.role<>'owner' or new.status<>'active' then
   if not exists(select 1 from public.organization_memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=old.organization_id and m.id<>old.id and m.role='owner' and m.status='active'
     and coalesce(u.banned_until,'-infinity')<=clock_timestamp()) then
    raise sqlstate 'PT409' using message='At least one active Organization Super Admin must remain';
   end if;
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;$$;
create trigger organization_membership_revision_and_last_holder before update or delete on public.organization_memberships
 for each row execute function private.guard_organization_membership_change();
revoke all on function private.guard_organization_membership_change() from public,anon,authenticated,service_role;

create function private.can_manage_organization_member(actor uuid,org uuid,target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(actor<>target and private.schedule_actor_can(actor,'permissions',org)
  and exists(select 1 from public.organization_memberships a join public.organization_memberships t on t.organization_id=a.organization_id
   where a.organization_id=org and a.user_id=actor and a.status='active' and t.user_id=target
    and t.status in ('active','suspended') and (a.role='owner' or (a.role='admin' and t.role='member')))
  and not exists(select 1 from private.platform_operators where user_id=target),false);
$$;
revoke all on function private.can_manage_organization_member(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function public.list_organization_members(target_organization_id uuid,after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();
 perform private.require_organization_mfa(target_organization_id);
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id) then raise sqlstate 'PT404' using message='Members unavailable'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select m.id,m.user_id,m.role,m.status,m.revision,coalesce(p.display_name,u.email,'Member') as name,
   private.can_manage_organization_member(auth.uid(),target_organization_id,m.user_id) as can_manage,
   n.event_id as notification_id,n.delivery_state as notification_state
  from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.user_id=m.user_id
  left join lateral (select event_id,delivery_state from private.administration_notification_outbox n where n.membership_id=m.id order by membership_revision desc limit 1) n on true
  where m.organization_id=target_organization_id and (after_id is null or m.id>after_id) order by m.id limit 26
 ) page);
end;$$;
create function public.set_organization_member_status(target_organization_id uuid,target_membership_id uuid,expected_revision bigint,
 request_id uuid,next_status text,confirmed boolean,reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target public.organization_memberships; fp text; receipt private.membership_status_receipts;
 result jsonb; event uuid; changed boolean;
begin
 perform public.require_active_schedule_session();
 perform private.lock_schedule_permissions(target_organization_id);
 select * into target from public.organization_memberships where id=target_membership_id and organization_id=target_organization_id for update;
 if not found or not private.can_manage_organization_member(actor,target_organization_id,target.user_id) then raise sqlstate 'PT404' using message='Membership change unavailable'; end if;
 perform private.require_recent_totp();
 if request_id is null or expected_revision is null or expected_revision<1 or expected_revision>=9007199254740991
  or next_status is null or next_status not in ('active','suspended') or confirmed is distinct from true
  or reason is null or length(btrim(reason)) not between 1 and 500 then raise sqlstate 'PT400' using message='Confirm the membership and reason'; end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(target_organization_id,target_membership_id,expected_revision,next_status,btrim(reason),confirmed));
 select * into receipt from private.membership_status_receipts r where r.request_id=set_organization_member_status.request_id;
 if found then
  if receipt.actor_id<>actor or receipt.organization_id<>target_organization_id or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Request already used'; end if;
  return receipt.result;
 end if;
 if target.revision<>expected_revision then raise sqlstate 'PT409' using message='Membership changed; review current state'; end if;
 changed:=target.status::text<>next_status;
 if changed then
  -- Retain the role, joined_at and every independent production/schedule restriction.
  update public.organization_memberships set status=next_status::public.membership_status where id=target.id returning * into target;
  event:=request_id;
  insert into private.administration_notification_outbox(event_id,organization_id,membership_id,recipient_id,actor_id,next_status,membership_revision)
   values(event,target_organization_id,target.id,target.user_id,actor,next_status,target.revision);
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
   values(target_organization_id,actor,case when next_status='active' then 'organization.member.reinstated' else 'organization.member.suspended' end,
   'organization_membership',target.id,jsonb_build_object('role',target.role,'revision',target.revision,'reason',btrim(reason),'request_id',request_id));
 end if;
 result:=jsonb_build_object('confirmed',true,'request_id',request_id,'membership_id',target.id,'organization_id',target_organization_id,
  'status',target.status,'role',target.role,'revision',target.revision,'changed',changed,'notification_id',event);
 insert into private.membership_status_receipts values(request_id,target_organization_id,actor,target.id,fp,result,clock_timestamp());
 return result;
end;$$;
comment on function public.set_organization_member_status(uuid,uuid,bigint,uuid,text,boolean,text) is
 'Explicit authorized membership suspension/reinstatement. Prior role and independent restrictions retained; invitation acceptance never reinstates suspended membership.';
revoke all on function public.list_organization_members(uuid,uuid),public.set_organization_member_status(uuid,uuid,bigint,uuid,text,boolean,text) from public,anon,service_role;
grant execute on function public.list_organization_members(uuid,uuid),public.set_organization_member_status(uuid,uuid,bigint,uuid,text,boolean,text) to authenticated;

-- Service-only delivery contract. Membership transaction commits even when mail is unavailable.
create function public.claim_membership_notification(p_actor_user_id uuid,p_organization_id uuid,p_event_id uuid,p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.administration_notification_outbox; headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 if p_actor_user_id is distinct from private.request_actor() then raise sqlstate 'PT403' using message='Delivery unavailable'; end if;
 perform public.require_service_actor_session(p_actor_user_id,(headers->>'x-actor-session-id')::uuid,(headers->>'x-actor-session-exp')::bigint);
 if private.request_actor_aal(p_actor_user_id) is distinct from 'aal2' or not private.schedule_actor_can(p_actor_user_id,'permissions',p_organization_id) then raise sqlstate 'PT404' using message='Delivery unavailable'; end if;
 if p_claim_id is null then raise sqlstate 'PT400' using message='Claim required'; end if;
 select * into n from private.administration_notification_outbox where event_id=p_event_id and organization_id=p_organization_id for update;
 if not found then raise sqlstate 'PT404' using message='Delivery unavailable'; end if;
 if n.delivery_state='delivered' then return jsonb_build_object('state','delivered'); end if;
 if n.delivery_state='sending' and n.lease_until>clock_timestamp() then return jsonb_build_object('state','sending'); end if;
 update private.administration_notification_outbox set delivery_state='sending',attempts=attempts+1,claim_id=p_claim_id,claimed_by=p_actor_user_id,
  lease_until=clock_timestamp()+interval '60 seconds',last_error=null where event_id=n.event_id;
 return (select jsonb_build_object('state','claimed','event_id',n.event_id,'email',u.email,'organization',o.name,'status',n.next_status,'revision',n.membership_revision)
  from auth.users u join public.organizations o on o.id=n.organization_id where u.id=n.recipient_id);
end;$$;
create function public.finish_membership_notification(p_actor_user_id uuid,p_event_id uuid,p_claim_id uuid,p_delivered boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 -- A worker records its admitted delivery outcome even if the actor's authority changed during delivery.
 if p_actor_user_id is distinct from private.request_actor() then raise sqlstate 'PT403' using message='Delivery unavailable'; end if;
 update private.administration_notification_outbox set delivery_state=case when p_delivered then 'delivered' else 'failed' end,
  delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else 'Local mail delivery not confirmed' end,lease_until=null
  where event_id=p_event_id and claim_id=p_claim_id and claimed_by=p_actor_user_id and delivery_state='sending';
 return found;
end;$$;
revoke all on function public.claim_membership_notification(uuid,uuid,uuid,uuid),public.finish_membership_notification(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_membership_notification(uuid,uuid,uuid,uuid),public.finish_membership_notification(uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';

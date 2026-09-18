-- Keep older undelivered notices visible after later membership changes.
create index membership_notices_pending on private.administration_notification_outbox(membership_id,membership_revision) where delivery_state<>'delivered';
create or replace function public.list_organization_members(target_organization_id uuid,after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();
 perform private.require_organization_mfa(target_organization_id);
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id) then raise sqlstate 'PT404' using message='Members unavailable'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select m.id,m.user_id,m.role,m.status,m.revision,coalesce(p.display_name,u.email,'Member') as name,
   private.can_manage_organization_member(auth.uid(),target_organization_id,m.user_id) as can_manage,
   n.event_id as notification_id,n.delivery_state as notification_state,
   (select coalesce(jsonb_agg(to_jsonb(q) order by q.membership_revision),'[]') from (
    select event_id,next_status,membership_revision,delivery_state from private.administration_notification_outbox
    where membership_id=m.id and delivery_state<>'delivered' order by membership_revision limit 5
   ) q) as pending_notifications
  from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.user_id=m.user_id
  left join lateral (select event_id,delivery_state from private.administration_notification_outbox n where n.membership_id=m.id order by membership_revision desc limit 1) n on true
  where m.organization_id=target_organization_id and (after_id is null or m.id>after_id) order by m.id limit 26
 ) page);
end;$$;

notify pgrst,'reload schema';

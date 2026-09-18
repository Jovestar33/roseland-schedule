create or replace function private.guard_organization_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb; orgs uuid[]:='{}'; org uuid; value uuid;
begin
 if tg_table_schema='public' and tg_table_name='organizations' then
  if tg_op='UPDATE' then
   if new.deleted_at is distinct from old.deleted_at then raise sqlstate 'PT403' using message='Use the organization deletion request workflow';end if;
  elsif tg_op='DELETE' then raise sqlstate 'PT403' using message='Organization purge is not implemented';end if;
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
create function public.claim_organization_lifecycle_notice(p_actor_user_id uuid,p_organization_id uuid,p_event_id uuid,p_recipient_id uuid,p_claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.administration_notification_outbox;h jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
begin
 if p_actor_user_id is distinct from private.request_actor() then raise sqlstate 'PT403' using message='Delivery unavailable';end if;
 perform public.require_service_actor_session(p_actor_user_id,(h->>'x-actor-session-id')::uuid,(h->>'x-actor-session-exp')::bigint);
 if private.request_actor_aal(p_actor_user_id) is distinct from 'aal2' or not private.organization_lifecycle_owner(p_actor_user_id,p_organization_id) then raise sqlstate 'PT404' using message='Delivery unavailable';end if;
 if p_claim_id is null then raise sqlstate 'PT400' using message='Claim required';end if;
 select * into n from private.administration_notification_outbox where organization_id=p_organization_id and event_id=p_event_id and recipient_id=p_recipient_id and event_kind<>'membership' for update;
 if not found then raise sqlstate 'PT404' using message='Delivery unavailable';end if;
 if n.delivery_state='delivered' then return jsonb_build_object('state','delivered');end if;
 if n.delivery_state='sending' and n.lease_until>clock_timestamp() then return jsonb_build_object('state','sending');end if;
 update private.administration_notification_outbox set delivery_state='sending',attempts=attempts+1,claim_id=p_claim_id,claimed_by=p_actor_user_id,lease_until=clock_timestamp()+interval '60 seconds',last_error=null where event_id=n.event_id and recipient_id=n.recipient_id;
 return (select jsonb_build_object('state','claimed','email',u.email,'organization',o.name,'kind',n.event_kind,'version',n.lifecycle_version,'cancel_before',n.cancel_before) from auth.users u join public.organizations o on o.id=n.organization_id where u.id=n.recipient_id);
end;$$;
create function public.finish_organization_lifecycle_notice(p_actor_user_id uuid,p_event_id uuid,p_recipient_id uuid,p_claim_id uuid,p_delivered boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_actor_user_id is distinct from private.request_actor() then raise sqlstate 'PT403' using message='Delivery unavailable';end if;
 update private.administration_notification_outbox set delivery_state=case when p_delivered then 'delivered' else 'failed' end,delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else 'Local mail delivery not confirmed' end,lease_until=null
 where event_id=p_event_id and recipient_id=p_recipient_id and claim_id=p_claim_id and claimed_by=p_actor_user_id and delivery_state='sending' and event_kind<>'membership';
 return found;
end;$$;
revoke all on function public.claim_organization_lifecycle_notice(uuid,uuid,uuid,uuid,uuid),public.finish_organization_lifecycle_notice(uuid,uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_organization_lifecycle_notice(uuid,uuid,uuid,uuid,uuid),public.finish_organization_lifecycle_notice(uuid,uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';

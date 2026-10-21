-- Human conflict review is separately authenticated from the machine worker.
create or replace function public.read_trial_sync_review(target_mapping_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;m private.trial_sync_mappings;s public.schedules;
begin
 perform public.require_active_schedule_session();
 select * into m from private.trial_sync_mappings where id=target_mapping_id;
 select * into i from private.trial_sync_integrations where id=m.integration_id;
 if i.id is null or not private.organization_lifecycle_owner(auth.uid(),i.organization_id) then raise sqlstate 'PT404' using message='Sync unavailable';end if;
 perform private.require_organization_mfa(i.organization_id);
 select * into s from public.schedules where id=m.schedule_id and organization_id=i.organization_id and deleted_at is null;
 if not found or not private.schedule_actor_can_without_template_bindings(auth.uid(),'export',i.organization_id,s.production_id,s.id) or not private.schedule_template_bindings_allow(auth.uid(),'export',i.organization_id,s.id) then raise sqlstate 'PT403' using message='Schedule unavailable';end if;
 return jsonb_build_object('integrationId',i.id,'organizationId',i.organization_id,'legacyOrigin',i.legacy_origin,'netlifySiteId',i.netlify_site_id,'mapping',jsonb_build_object('id',m.id,'supabaseId',m.schedule_id,'netlifyKey',m.legacy_key),'sequence',m.sequence,'entry',m.state,'enabled',i.enabled);
end;$$;

create or replace function public.begin_trial_sync_resolution(target_mapping_id uuid,claim_id uuid,expected_sequence bigint,take_copy text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;m private.trial_sync_mappings;review jsonb;
begin
 perform public.require_active_schedule_session();perform private.require_recent_totp();
 review:=public.read_trial_sync_review(target_mapping_id);
 i:=private.lock_trial_sync_integration((review->>'integrationId')::uuid);
 select * into m from private.trial_sync_mappings where id=target_mapping_id for update;
 if claim_id is null or take_copy is null or take_copy not in ('netlify','supabase') then raise sqlstate 'PT400' using message='Invalid resolution';end if;
 if expected_sequence is distinct from m.sequence or (m.lease_until is not null and m.lease_until>clock_timestamp()) then raise sqlstate 'PT409' using message='Comparison changed or in progress';end if;
 if coalesce(m.state->>'status','') not in ('content-conflict','initial-conflict','uncertain') or jsonb_typeof(m.state->'observed') is distinct from 'object' then raise sqlstate 'PT409' using message='Fresh conflict review required';end if;
 update private.trial_sync_mappings set lease_token=claim_id,lease_until=clock_timestamp()+interval '120 seconds',checked_at=clock_timestamp() where id=m.id returning * into m;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(i.organization_id,auth.uid(),'trial_sync.resolution_requested','schedule',m.schedule_id,jsonb_build_object('mapping_id',m.id,'sequence',m.sequence,'selected_copy',take_copy,'legacy_version',m.state->'observed'->'netlify'->>'version','target_version',m.state->'observed'->'supabase'->>'version'));
 return jsonb_build_object('state','claimed','mapping',review->'mapping','organizationId',i.organization_id,'legacyOrigin',i.legacy_origin,'netlifySiteId',i.netlify_site_id,'entry',m.state,'sequence',m.sequence,'leaseUntil',m.lease_until);
end;$$;

-- A pilot can claim only its explicitly configured schedule(s). An empty,
-- unknown or cross-integration scope is rejected rather than expanded.
create or replace function public.claim_scoped_trial_sync_mapping(target_integration_id uuid,claim_id uuid,allowed_mapping_ids uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;m private.trial_sync_mappings;
begin
 if claim_id is null or cardinality(allowed_mapping_ids) is null or cardinality(allowed_mapping_ids) not between 1 and 10000 or array_position(allowed_mapping_ids,null) is not null then raise sqlstate 'PT400' using message='Explicit mapping scope required';end if;
 i:=private.lock_trial_sync_integration(target_integration_id);
 if exists(select 1 from unnest(allowed_mapping_ids) x where not exists(select 1 from private.trial_sync_mappings scoped where scoped.id=x and scoped.integration_id=i.id)) then raise sqlstate 'PT409' using message='Mapping scope changed';end if;
 select * into m from private.trial_sync_mappings where integration_id=i.id and id=any(allowed_mapping_ids)
 and (lease_until is null or lease_until<clock_timestamp()) and (checked_at is null or checked_at<clock_timestamp()-interval '45 seconds') order by checked_at nulls first,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('state','idle');end if;
 update private.trial_sync_mappings set lease_token=claim_id,lease_until=clock_timestamp()+interval '120 seconds',checked_at=clock_timestamp() where id=m.id returning * into m;
 return jsonb_build_object('state','claimed','mapping',jsonb_build_object('id',m.id,'netlifyKey',m.legacy_key,'supabaseId',m.schedule_id),'organizationId',i.organization_id,'legacyOrigin',i.legacy_origin,'netlifySiteId',i.netlify_site_id,'entry',m.state,'sequence',m.sequence,'leaseUntil',m.lease_until);
end;$$;
revoke all on function public.read_trial_sync_review(uuid),public.begin_trial_sync_resolution(uuid,uuid,bigint,text),public.claim_scoped_trial_sync_mapping(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.read_trial_sync_review(uuid),public.begin_trial_sync_resolution(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.claim_scoped_trial_sync_mapping(uuid,uuid,uuid[]) to service_role;
notify pgrst,'reload schema';

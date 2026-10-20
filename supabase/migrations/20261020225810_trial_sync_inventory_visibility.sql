-- Discovery never creates, rebinds, deletes or modifies schedules.
alter table private.trial_sync_integrations add column inventory jsonb;
alter table private.trial_sync_integrations add constraint trial_sync_inventory_shape
 check(inventory is null or (jsonb_typeof(inventory)='object' and octet_length(inventory::text)<=4194304));
create function public.record_trial_sync_inventory(target_integration_id uuid,expected_organization_id uuid,expected_site_id uuid,expected_origin text,legacy_keys text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations; result jsonb;
begin
 i:=private.lock_trial_sync_integration(target_integration_id);
 if i.organization_id is distinct from expected_organization_id or i.netlify_site_id is distinct from expected_site_id or i.legacy_origin is distinct from expected_origin then raise sqlstate 'PT409' using message='Source binding changed';end if;
 if legacy_keys is null or cardinality(legacy_keys)>10000 or exists(select 1 from unnest(legacy_keys) k where k is null or length(k) not between 1 and 1000)
 or (select count(distinct k) from unnest(legacy_keys) k)<>cardinality(legacy_keys) then raise sqlstate 'PT400' using message='Invalid source inventory';end if;
 result:=jsonb_build_object('checked_at',clock_timestamp(),'legacy_count',cardinality(legacy_keys),
 'legacy_unmapped',(select coalesce(jsonb_agg(k order by k),'[]') from unnest(legacy_keys) k where not exists(select 1 from private.trial_sync_mappings m where m.integration_id=i.id and m.legacy_key=k)),
 'legacy_missing',(select coalesce(jsonb_agg(m.legacy_key order by m.legacy_key),'[]') from private.trial_sync_mappings m where m.integration_id=i.id and not(m.legacy_key=any(legacy_keys))),
 'target_unmapped',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name) order by s.display_name,s.id),'[]') from public.schedules s where s.organization_id=i.organization_id and s.deleted_at is null and not exists(select 1 from private.trial_sync_mappings m where m.integration_id=i.id and m.schedule_id=s.id)),
 'target_missing',(select coalesce(jsonb_agg(m.schedule_id order by m.schedule_id),'[]') from private.trial_sync_mappings m where m.integration_id=i.id and not exists(select 1 from public.schedules s where s.id=m.schedule_id and s.organization_id=i.organization_id and s.deleted_at is null)));
 update private.trial_sync_integrations set inventory=result where id=i.id;
 return jsonb_build_object('attention',jsonb_array_length(result->'legacy_unmapped')+jsonb_array_length(result->'legacy_missing')+jsonb_array_length(result->'target_unmapped')+jsonb_array_length(result->'target_missing'));
end;$$;
revoke all on function public.record_trial_sync_inventory(uuid,uuid,uuid,text,text[]) from public,anon,authenticated;
grant execute on function public.record_trial_sync_inventory(uuid,uuid,uuid,text,text[]) to service_role;
create or replace function public.read_trial_sync_status(target_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;
begin
 perform public.require_active_schedule_session();perform private.require_organization_mfa(target_organization_id);
 if not private.organization_lifecycle_owner(auth.uid(),target_organization_id) then raise sqlstate 'PT404' using message='Sync unavailable';end if;
 select * into i from private.trial_sync_integrations where organization_id=target_organization_id;
 if not found then return jsonb_build_object('configured',false);end if;
 return jsonb_build_object('configured',true,'id',i.id,'revision',i.revision,'legacy_origin',i.legacy_origin,'enabled',i.enabled,'authorized',private.trial_sync_authorized(i),'inventory',i.inventory,
 'mappings',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'schedule_id',m.schedule_id,'legacy_key',m.legacy_key,'status',m.state->>'status','error',m.state->>'error','checked_at',m.checked_at,'completed_at',m.completed_at) order by m.legacy_key),'[]') from private.trial_sync_mappings m where integration_id=i.id));
end;$$;

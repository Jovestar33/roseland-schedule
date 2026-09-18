-- Settings, preserved catalogue materialization and snapshot copies.
create table private.schedule_snapshot_policy_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id), fingerprint text not null, version bigint not null
);
create table private.schedule_snapshot_imports (
 source_record_id uuid primary key references private.migration_records(id),
 snapshot_id uuid not null unique, fingerprint text not null
);
create table private.schedule_snapshot_copy_receipts (
 request_id uuid primary key, actor_id uuid not null references auth.users(id),
 organization_id uuid not null references public.organizations(id), source_id uuid not null,
 snapshot_id uuid not null, destination_id uuid not null, fingerprint text not null, result jsonb not null
);
alter table private.schedule_snapshot_policy_receipts enable row level security;
alter table private.schedule_snapshot_imports enable row level security;
alter table private.schedule_snapshot_copy_receipts enable row level security;
revoke all on private.schedule_snapshot_policy_receipts,private.schedule_snapshot_imports,private.schedule_snapshot_copy_receipts from public,anon,authenticated,service_role;

create function public.read_snapshot_policy(target_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; p private.schedule_snapshot_policy;
begin
 perform public.require_active_schedule_session();
 select m.role::text into member_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id and m.user_id=auth.uid() and m.status='active' and o.deleted_at is null;
 if member_role is null then raise sqlstate 'PT404' using message='Snapshot settings unavailable'; end if;
 select * into p from private.schedule_snapshot_policy where organization_id=target_organization_id;
 return jsonb_build_object('organization_id',target_organization_id,'version',coalesce(p.version,0),'retention_days',p.retention_days,'trash_min_role',coalesce(p.trash_min_role,'organizer'),'can_manage',member_role in ('owner','admin'));
end;$$;
create function public.save_snapshot_policy(target_organization_id uuid,request_id uuid,expected_version bigint,retention_days integer,trash_min_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt private.schedule_snapshot_policy_receipts; current_version bigint; fp text;
begin
 perform public.require_active_schedule_session();
 if request_id is null or expected_version is null or expected_version<0 or expected_version>=9007199254740991 or (retention_days is not null and retention_days not between 1 and 36500) or trash_min_role is null or trash_min_role not in ('editor','organizer','admin') then raise sqlstate 'PT400' using message='Invalid snapshot settings'; end if;
 perform pg_advisory_xact_lock(hashtextextended('snapshot-policy-request:'||request_id::text,0));
 perform private.lock_schedule_permissions(target_organization_id);
 if not exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin') and o.deleted_at is null) then raise sqlstate 'PT404' using message='Snapshot settings write unavailable'; end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(target_organization_id,expected_version,retention_days,trash_min_role));
 select * into receipt from private.schedule_snapshot_policy_receipts r where r.request_id=save_snapshot_policy.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.organization_id<>target_organization_id or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Request already used'; end if;
 else
  select version into current_version from private.schedule_snapshot_policy where organization_id=target_organization_id;
  if coalesce(current_version,0)<>expected_version then raise sqlstate 'PT409' using message='Settings changed; review current settings'; end if;
  insert into private.schedule_snapshot_policy(organization_id,version,retention_days,trash_min_role,updated_by) values(target_organization_id,expected_version+1,retention_days,trash_min_role,auth.uid()) on conflict(organization_id) do update set version=excluded.version,retention_days=excluded.retention_days,trash_min_role=excluded.trash_min_role,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  insert into private.schedule_snapshot_policy_receipts values(request_id,target_organization_id,auth.uid(),fp,expected_version+1) returning * into receipt;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(target_organization_id,auth.uid(),'snapshot.policy','organization',target_organization_id,jsonb_build_object('version',receipt.version));
 end if;
 return jsonb_build_object('confirmed',true,'request_id',request_id,'organization_id',target_organization_id,'version',receipt.version);
end;$$;

-- Trusted importer only. Existing catalogue envelopes are preserved unchanged.
-- The ledger survives purge so replay cannot resurrect deliberately removed copies.
create function private.materialize_snapshot_collection(collection_id uuid)
returns integer language plpgsql set search_path='' as $$
declare c private.migration_records; leaf private.migration_records; item record; s public.schedules; existing private.schedule_snapshot_imports; n integer:=0; bindings jsonb;
begin
 select * into c from private.migration_records where id=collection_id for share;
 if not found or c.source_store<>'schedule-snapshots' or c.source_item<>'' or c.tombstone or jsonb_typeof(c.payload->'snapshots') is distinct from 'array' then raise exception 'Snapshot collection unavailable'; end if;
 perform private.lock_schedule_permissions(c.organization_id);
 select * into s from public.schedules where id=(c.schedule_refs->>(c.payload->>'name'))::uuid and organization_id=c.organization_id for share;
 if not found then raise exception 'Snapshot source unresolved'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.template_id,'fingerprint',b.fingerprint,'contexts',b.contexts)),'[]') into bindings from private.schedule_template_bindings b where b.schedule_id=s.id;
 for item in select value,ordinality from jsonb_array_elements(c.payload->'snapshots') with ordinality loop
  select * into leaf from private.migration_records where organization_id=c.organization_id and source_environment=c.source_environment and source_store=c.source_store and source_key=c.source_key and source_item=item.value->>'id' for share;
  if not found or leaf.tombstone or leaf.payload<>item.value or leaf.schedule_refs<>c.schedule_refs or jsonb_typeof(item.value->'label') is distinct from 'string' or jsonb_typeof(item.value->'savedAt') is distinct from 'number' then raise exception 'Snapshot leaf does not match collection'; end if;
  perform private.validate_schedule_document(leaf.payload->'data',1);
  select * into existing from private.schedule_snapshot_imports where source_record_id=leaf.id;
  if found then
   if existing.fingerprint<>leaf.fingerprint then raise exception 'Imported snapshot changed; explicit migration review required'; end if;
   continue;
  end if;
  insert into private.schedule_snapshots(id,organization_id,schedule_id,name,kind,document,template_bindings,captured_at,original_id,original_order,original_payload)
   values(leaf.id,c.organization_id,s.id,leaf.payload->>'label','imported',leaf.payload->'data',bindings,to_timestamp((leaf.payload->>'savedAt')::numeric/1000),leaf.source_item,item.ordinality,leaf.payload);
  insert into private.schedule_snapshot_imports values(leaf.id,leaf.id,leaf.fingerprint);
  n:=n+1;
 end loop;
 return n;
end;$$;

create function public.review_snapshot_copy(target_snapshot_id uuid,target_production_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x private.schedule_snapshots; reviewed jsonb;
begin
 perform public.require_active_schedule_session();
 select * into x from private.schedule_snapshots where id=target_snapshot_id;
 if not found or x.deleted_at is not null or not private.snapshot_actor_can(auth.uid(),x.id,'copy') then raise sqlstate 'PT404' using message='Snapshot copy unavailable'; end if;
 reviewed:=public.review_schedule_copy(x.schedule_id,target_production_id);
 return reviewed||jsonb_build_object('snapshot_id',x.id,'snapshot_version',x.version);
end;$$;
create function public.copy_schedule_snapshot(request_id uuid,target_snapshot_id uuid,expected_version bigint,target_schedule_id uuid,source_version bigint,source_policy text,target_production_id uuid,target_day_id uuid,target_phase_id uuid,next_display_name text,next_slug text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare x private.schedule_snapshots; s public.schedules; fp text; receipt private.schedule_snapshot_copy_receipts; result jsonb; b jsonb;
begin
 perform public.require_active_schedule_session();
 if request_id is null or target_schedule_id is null or expected_version is null or expected_version<1 then raise sqlstate 'PT400' using message='Invalid snapshot copy'; end if;
 perform pg_advisory_xact_lock(hashtextextended('snapshot-copy-request:'||request_id::text,0));
 fp:=private.workflow_fingerprint(jsonb_build_array(target_snapshot_id,expected_version,target_schedule_id,source_version,source_policy,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug));
 select * into receipt from private.schedule_snapshot_copy_receipts r where r.request_id=copy_schedule_snapshot.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.fingerprint<>fp or not public.schedule_visible(receipt.destination_id,'read') then raise sqlstate 'PT404' using message='Snapshot copy result unavailable'; end if;
  return receipt.result;
 end if;
 select * into x from private.schedule_snapshots where id=target_snapshot_id;
 if not found then raise sqlstate 'PT404' using message='Snapshot unavailable'; end if;
 select * into s from public.schedules where id=x.schedule_id;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 select * into s from public.schedules where id=s.id for share;
 select * into x from private.schedule_snapshots where id=target_snapshot_id for share;
 if x.deleted_at is not null or not private.snapshot_actor_can(auth.uid(),x.id,'copy') then raise sqlstate 'PT404' using message='Snapshot copy unavailable'; end if;
 if x.version<>expected_version then raise sqlstate 'PT409' using message='Snapshot changed; review again'; end if;
 result:=public.copy_schedule_to_production(target_schedule_id,s.id,source_version,source_policy,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug,x.document,1);
 for b in select value from jsonb_array_elements(x.template_bindings) loop
  insert into private.schedule_template_bindings(schedule_id,template_id,fingerprint,contexts) values(target_schedule_id,(b->>'id')::uuid,b->>'fingerprint',b->'contexts') on conflict do nothing;
 end loop;
 if not public.schedule_visible(target_schedule_id,'edit') then raise sqlstate 'PT404' using message='Copy cannot preserve editable access'; end if;
 result:=result||jsonb_build_object('request_id',request_id,'snapshot_id',x.id);
 insert into private.schedule_snapshot_copy_receipts values(request_id,auth.uid(),s.organization_id,s.id,x.id,target_schedule_id,fp,result);
 return result;
end;$$;
create function public.check_snapshot_copy(request_id uuid,target_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.schedule_snapshot_copy_receipts;
begin
 perform public.require_active_schedule_session();
 select * into r from private.schedule_snapshot_copy_receipts c where c.request_id=check_snapshot_copy.request_id and c.actor_id=auth.uid() and c.destination_id=target_schedule_id;
 if not found then return jsonb_build_object('confirmed',false); end if;
 if not public.schedule_visible(target_schedule_id,'read') then raise sqlstate 'PT404' using message='Snapshot copy result unavailable'; end if;
 return r.result;
end;$$;
revoke all on function private.materialize_snapshot_collection(uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_snapshot_policy(uuid),public.save_snapshot_policy(uuid,uuid,bigint,integer,text),public.review_snapshot_copy(uuid,uuid),public.copy_schedule_snapshot(uuid,uuid,bigint,uuid,bigint,text,uuid,uuid,uuid,text,text),public.check_snapshot_copy(uuid,uuid) from public,anon,service_role;
grant execute on function public.read_snapshot_policy(uuid),public.save_snapshot_policy(uuid,uuid,bigint,integer,text),public.review_snapshot_copy(uuid,uuid),public.copy_schedule_snapshot(uuid,uuid,bigint,uuid,bigint,text,uuid,uuid,uuid,text,text),public.check_snapshot_copy(uuid,uuid) to authenticated;
notify pgrst,'reload schema';

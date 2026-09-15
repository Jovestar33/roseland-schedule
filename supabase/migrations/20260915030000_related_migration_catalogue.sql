-- Trusted migration catalogue. This does not grant application/template/CMS
-- permissions or decide browser-data ownership, snapshot deletion or retention.
create table private.migration_records (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  source_environment text not null check (length(source_environment) between 1 and 160),
  source_store text not null check (source_store in ('schedule-snapshots','schedule-templates','schedule-library','cms')),
  source_key text not null check (length(source_key) between 1 and 1024),
  source_item text not null check (length(source_item)<=1024),
  source_revision bigint not null check (source_revision>0),
  payload jsonb not null check (jsonb_typeof(payload) in ('object','array') and octet_length(payload::text)<=16777216),
  schedule_refs jsonb not null check (jsonb_typeof(schedule_refs)='object'),
  tombstone boolean not null default false,
  version bigint not null check (version>0),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  import_run_id uuid not null,
  updated_at timestamptz not null default now(),
  unique(organization_id,source_environment,source_store,source_key,source_item),
  unique(organization_id,id)
);
create table private.migration_record_versions (
  record_id uuid not null,
  organization_id uuid not null,
  version bigint not null,
  snapshot jsonb not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  import_run_id uuid not null,
  imported_at timestamptz not null default now(),
  primary key(record_id,version),
  foreign key(organization_id,record_id) references private.migration_records(organization_id,id) on delete restrict
);
alter table private.migration_records enable row level security;
alter table private.migration_record_versions enable row level security;
revoke all on private.migration_records,private.migration_record_versions from public,anon,authenticated,service_role;
create trigger migration_versions_immutable before update or delete on private.migration_record_versions
  for each row execute function public.prevent_schedule_version_mutation();

create function private.migration_record_state(p private.migration_records)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('id',p.id,'organization_id',p.organization_id,'environment',p.source_environment,
    'store',p.source_store,'key',p.source_key,'item',p.source_item,'revision',p.source_revision,
    'payload',p.payload,'refs',p.schedule_refs,'tombstone',p.tombstone,'version',p.version);
$$;
create function private.migration_fingerprint(value jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex');
$$;
create function private.import_related_record(
  target_org uuid, source_env text, store_name text, blob_key text, item_key text,
  record_id uuid, revision bigint, value jsonb, refs jsonb, removed boolean,
  expected_version bigint, expected_fingerprint text, run_id uuid
) returns jsonb language plpgsql set search_path='' as $$
declare old_record private.migration_records; saved private.migration_records;
  ref record; result_state jsonb;
begin
  -- Only the trusted database importer can execute this; no definer or API grant.
  if target_org is null or record_id is null or run_id is null or revision is null or revision<1
    or removed is null or expected_version is null or expected_version<0
    or jsonb_typeof(value) not in ('object','array') or value is null
    or jsonb_typeof(refs) is distinct from 'object' then raise exception 'Invalid migration envelope'; end if;
  perform 1 from public.organizations where id=target_org and deleted_at is null for share;
  if not found then raise exception 'Migration organization unavailable'; end if;
  -- Serializes one tenant catalogue, so competing imports cannot overwrite a
  -- checked baseline. Schedule locks preserve verified reference ownership.
  perform pg_advisory_xact_lock(hashtextextended('migration-related/'||target_org::text,0));
  for ref in select entry.key,entry.value as target from jsonb_each_text(refs) entry order by entry.value loop
    perform 1 from public.schedules where id=ref.target::uuid and organization_id=target_org for share;
    if not found then raise exception 'Unresolved or cross-tenant schedule reference'; end if;
  end loop;
  -- Defense in depth for document-bearing leaf records. The trusted planner
  -- validates complete collection/library/CMS contracts before submitting any row.
  if store_name='schedule-snapshots' and item_key<>'' then
    perform private.validate_schedule_document(value->'data',1);
  elsif store_name='schedule-templates' and item_key<>'' then
    perform private.validate_schedule_document(jsonb_build_object('meta','{}'::jsonb,'rows',value->'rows'),1);
  end if;
  select * into old_record from private.migration_records where id=record_id for update;
  if found then
    if old_record.organization_id<>target_org or old_record.source_environment<>source_env
      or old_record.source_store<>store_name or old_record.source_key<>blob_key or old_record.source_item<>item_key then
      raise exception 'Migration identity cannot change';
    end if;
    if old_record.version<>expected_version or old_record.fingerprint is distinct from expected_fingerprint
      or private.migration_fingerprint(private.migration_record_state(old_record))<>old_record.fingerprint then
      raise exception 'Migration target drift or stale precondition';
    end if;
    if revision<old_record.source_revision then raise exception 'Source revision regression'; end if;
    if revision=old_record.source_revision then
      if old_record.payload=value and old_record.schedule_refs=refs and old_record.tombstone=removed then
        return jsonb_build_object('action','skipped','record',to_jsonb(old_record));
      end if;
      raise exception 'Source changed without a new revision';
    end if;
    if removed and (old_record.payload<>value or old_record.schedule_refs<>refs) then
      raise exception 'Tombstone must preserve the previous payload and references';
    end if;
    update private.migration_records set source_revision=revision,payload=value,schedule_refs=refs,
      tombstone=removed,version=version+1,import_run_id=run_id,updated_at=now()
      where id=record_id returning * into saved;
  else
    if expected_version<>0 or expected_fingerprint is not null or removed then raise exception 'Invalid create precondition'; end if;
    insert into private.migration_records(id,organization_id,source_environment,source_store,source_key,source_item,
      source_revision,payload,schedule_refs,tombstone,version,fingerprint,import_run_id)
    values(record_id,target_org,source_env,store_name,blob_key,item_key,revision,value,refs,false,1,repeat('0',64),run_id)
    returning * into saved;
  end if;
  result_state:=private.migration_record_state(saved);
  update private.migration_records set fingerprint=private.migration_fingerprint(result_state) where id=record_id returning * into saved;
  insert into private.migration_record_versions(record_id,organization_id,version,snapshot,fingerprint,import_run_id)
    values(record_id,target_org,saved.version,result_state,saved.fingerprint,run_id);
  return jsonb_build_object('action',case when expected_version=0 then 'inserted' else 'updated' end,'record',to_jsonb(saved));
end;
$$;
revoke all on function private.migration_record_state(private.migration_records) from public,anon,authenticated,service_role;
revoke all on function private.migration_fingerprint(jsonb) from public,anon,authenticated,service_role;
revoke all on function private.import_related_record(uuid,text,text,text,text,uuid,bigint,jsonb,jsonb,boolean,bigint,text,uuid) from public,anon,authenticated,service_role;

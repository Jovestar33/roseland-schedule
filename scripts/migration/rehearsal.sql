-- Loaded only by the synthetic local runner, inside a transaction that rolls back.
-- All mappings/helpers are session temporary; this is not a hosted importer.
create temporary table rehearsal_map (
  source_key text primary key, target_id uuid not null unique, source_revision bigint not null,
  source_hash text not null, target_version bigint not null, document_hash text not null,
  metadata jsonb not null
);
create function pg_temp.rehearsal_hash(value jsonb) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(value::text,'UTF8'),'sha256'),'hex');
$$;
create function pg_temp.rehearsal_metadata(s public.schedules) returns jsonb language sql immutable as $$
  select jsonb_build_object('display_name',s.display_name,'slug',s.slug,'status',s.status,
    'production_day_id',s.production_day_id,'town',s.town,'deleted_at',s.deleted_at);
$$;
create function pg_temp.rehearsal_expected(r jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('display_name',r->>'name','slug',r->>'slug','status','draft',
    'production_day_id',r->>'day_id','town',nullif(btrim(r->'document'->'meta'->>'town'),''),'deleted_at',null);
$$;
create function pg_temp.rehearsal_validate(manifest jsonb) returns void language plpgsql as $$
declare r jsonb;
begin
  if jsonb_typeof(manifest) is distinct from 'array' or jsonb_array_length(manifest)=0 then
    raise exception 'Invalid synthetic manifest';
  end if;
  if exists(select 1 from jsonb_array_elements(manifest) x group by x->>'key' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(manifest) x group by x->>'id' having count(*)>1) then
    raise exception 'Duplicate source or target identity';
  end if;
  for r in select value from jsonb_array_elements(manifest) loop
    if (r - array['key','id','day_id','position','date','revision','name','slug','document'])<>'{}'::jsonb
      or jsonb_typeof(r->'key') is distinct from 'string' or length(r->>'key')=0
      or jsonb_typeof(r->'revision') is distinct from 'number'
      or (r->>'revision')::numeric < 1 or (r->>'revision')::numeric <> trunc((r->>'revision')::numeric)
      or (r->>'id')::uuid is null or (r->>'day_id')::uuid is null
      or (r->>'date')::date is null or (r->>'position')::int is null then
      raise exception 'Invalid synthetic source record';
    end if;
    perform private.validate_schedule_name(r->>'name',r->>'slug');
    perform private.validate_schedule_document(r->'document',1);
  end loop;
end;
$$;
create function pg_temp.rehearsal_import(manifest jsonb) returns jsonb language plpgsql as $$
declare r jsonb; m rehearsal_map; s public.schedules; saved jsonb;
  inserted integer:=0; changed integer:=0; skipped integer:=0;
  org uuid:=current_setting('rehearsal.org')::uuid;
  prod uuid:=current_setting('rehearsal.production')::uuid;
  phase uuid:=current_setting('rehearsal.phase')::uuid;
begin
  perform pg_temp.rehearsal_validate(manifest); -- Validate the whole batch first.
  if exists(select 1 from rehearsal_map x where not exists(select 1 from jsonb_array_elements(manifest) item where item->>'key'=x.source_key)) then
    raise exception 'Source disappearance requires reviewed tombstone or rename mapping';
  end if;
  for r in select value from jsonb_array_elements(manifest) order by value->>'key' loop
    select * into m from rehearsal_map where source_key=r->>'key';
    if found then
      select * into s from public.schedules where id=m.target_id for update;
      if not found or s.document_version<>m.target_version
        or pg_temp.rehearsal_hash(s.document)<>m.document_hash
        or pg_temp.rehearsal_metadata(s)<>m.metadata then
        raise exception 'Target divergence: refusing to overwrite';
      end if;
      if m.target_id<>(r->>'id')::uuid or (r->>'revision')::bigint<m.source_revision then
        raise exception 'Identity change or source revision regression';
      end if;
      if pg_temp.rehearsal_hash(r)=m.source_hash then skipped:=skipped+1; continue; end if;
      if (r->>'revision')::bigint=m.source_revision then raise exception 'Source changed without advancing revision'; end if;
      if (pg_temp.rehearsal_expected(r)-'town')<>(m.metadata-'town') then
        raise exception 'Lifecycle or placement delta requires extended importer';
      end if;
      saved := public.update_schedule_document(m.target_id,m.target_version,r->'document',1);
      changed:=changed+1;
    else
      -- Synthetic hierarchy mapping is explicit, never inferred from real names.
      insert into public.production_days(id,organization_id,production_id,phase_id,calendar_date,position,created_by,updated_by)
        values((r->>'day_id')::uuid,org,prod,phase,(r->>'date')::date,(r->>'position')::int,auth.uid(),auth.uid());
      saved := public.create_schedule((r->>'id')::uuid,(r->>'day_id')::uuid,r->>'name',r->>'slug',r->'document',1);
      inserted:=inserted+1;
    end if;
    insert into rehearsal_map values(r->>'key',(r->>'id')::uuid,(r->>'revision')::bigint,
      pg_temp.rehearsal_hash(r),(saved->>'document_version')::bigint,pg_temp.rehearsal_hash(r->'document'),pg_temp.rehearsal_expected(r))
    on conflict(source_key) do update set source_revision=excluded.source_revision,source_hash=excluded.source_hash,
      target_version=excluded.target_version,document_hash=excluded.document_hash,metadata=excluded.metadata;
  end loop;
  return jsonb_build_object('inserted',inserted,'updated',changed,'skipped',skipped);
end;
$$;
create function pg_temp.rehearsal_reconcile(manifest jsonb, boundary text) returns jsonb language plpgsql as $$
declare r jsonb; m rehearsal_map; s public.schedules; v public.schedule_versions;
  records jsonb:='[]'; missing jsonb:='[]'; mismatched jsonb:='[]'; duplicates jsonb:='[]'; unexpected jsonb;
  ok boolean;
begin
  select coalesce(jsonb_agg(k),'[]') into duplicates from (
    select x->>'key' k from jsonb_array_elements(manifest) x group by x->>'key' having count(*)>1
    union select x->>'id' from jsonb_array_elements(manifest) x group by x->>'id' having count(*)>1
  ) d;
  for r in select value from jsonb_array_elements(manifest) order by value->>'key' loop
    select * into m from rehearsal_map where source_key=r->>'key';
    select * into s from public.schedules where id=(r->>'id')::uuid;
    if m.target_id is null or s.id is null then missing:=missing||jsonb_build_array(r->>'key'); continue; end if;
    select * into v from public.schedule_versions where schedule_id=s.id and version=s.document_version;
    ok := m.target_id=s.id and m.source_revision=(r->>'revision')::bigint and m.source_hash=pg_temp.rehearsal_hash(r)
      and s.document_version=m.target_version and s.document=r->'document'
      and pg_temp.rehearsal_hash(s.document)=m.document_hash
      and pg_temp.rehearsal_metadata(s)=pg_temp.rehearsal_expected(r)
      and v.document=s.document and v.checksum=pg_temp.rehearsal_hash(s.document)
      and v.metadata @> pg_temp.rehearsal_expected(r)
      and v.metadata_checksum=pg_temp.rehearsal_hash(v.metadata)
      and exists(select 1 from public.production_days d where d.id=s.production_day_id
        and d.calendar_date=(r->>'date')::date and d.position=(r->>'position')::int
        and d.phase_id=current_setting('rehearsal.phase')::uuid and d.deleted_at is null)
      and (select count(*) from public.schedule_versions where schedule_id=s.id)=s.document_version;
    if ok is distinct from true then mismatched:=mismatched||jsonb_build_array(r->>'key'); end if;
    records:=records||jsonb_build_array(jsonb_build_object('source_key',r->>'key','target_id',s.id,
      'source_revision',r->'revision','target_version',s.document_version,
      'source_document_sha256',pg_temp.rehearsal_hash(r->'document'),'target_document_sha256',pg_temp.rehearsal_hash(s.document),
      'source_metadata_sha256',pg_temp.rehearsal_hash(pg_temp.rehearsal_expected(r)),
      'target_metadata_sha256',pg_temp.rehearsal_hash(pg_temp.rehearsal_metadata(s)),
      'history_versions',(select count(*) from public.schedule_versions where schedule_id=s.id),
      'verified',coalesce(ok,false)));
  end loop;
  select coalesce(jsonb_agg(extra.id),'[]') into unexpected from public.schedules extra
    where extra.production_id=current_setting('rehearsal.production')::uuid
      and not exists(select 1 from jsonb_array_elements(manifest) item where item->>'id'=extra.id::text);
  return jsonb_build_object('consistency_boundary',boundary,'records',records,'missing',missing,
    'duplicates',duplicates,'mismatched',mismatched,'unexpected',unexpected,'failed','[]'::jsonb,
    'schedule_copy_verified',missing='[]'::jsonb and duplicates='[]'::jsonb and mismatched='[]'::jsonb and unexpected='[]'::jsonb,
    'migration_complete',false,
    'remaining_parity_gates',jsonb_build_array('snapshot import and reconciliation','full library metadata','templates','CMS','legacy URLs/shares','hosted target and UI','verified backup/rollback'));
end;
$$;
-- Test-only subtransaction: failed batches must preserve rows, history and mappings.
create function pg_temp.rehearsal_expect_rejection(manifest jsonb) returns jsonb language plpgsql as $$
declare before_state jsonb; after_state jsonb; rejected boolean:=false;
begin
  select jsonb_build_object('schedules',(select jsonb_agg(to_jsonb(s) order by id) from public.schedules s),
    'versions',(select count(*) from public.schedule_versions),'audits',(select count(*) from public.audit_events),'map',(select jsonb_agg(to_jsonb(m) order by source_key) from rehearsal_map m)) into before_state;
  begin perform pg_temp.rehearsal_import(manifest); exception when others then rejected:=true; end;
  select jsonb_build_object('schedules',(select jsonb_agg(to_jsonb(s) order by id) from public.schedules s),
    'versions',(select count(*) from public.schedule_versions),'audits',(select count(*) from public.audit_events),'map',(select jsonb_agg(to_jsonb(m) order by source_key) from rehearsal_map m)) into after_state;
  if not rejected or before_state is distinct from after_state then raise exception 'Expected atomic refusal'; end if;
  return jsonb_build_object('rejected',true,'rows_history_mappings_unchanged',true);
end;
$$;

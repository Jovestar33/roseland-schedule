-- Session-only helpers for fictional fixtures; caller always rolls back.
create function pg_temp.related_import(records jsonb, documents jsonb) returns jsonb language plpgsql as $$
declare r jsonb; doc jsonb; old private.migration_records; outcome jsonb;
  inserted integer:=0; updated integer:=0; skipped integer:=0;
begin
  if exists(select 1 from jsonb_array_elements(records) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate target'; end if;
  for doc in select value from jsonb_array_elements(documents) loop perform private.validate_schedule_document(doc,1); end loop;
  for r in select value from jsonb_array_elements(records) loop
    select * into old from private.migration_records where id=(r->>'id')::uuid;
    outcome:=private.import_related_record((r->>'org')::uuid,r->>'environment',r->>'store',r->>'key',r->>'item',
      (r->>'id')::uuid,(r->>'revision')::bigint,r->'payload',r->'refs',(r->>'tombstone')::boolean,
      coalesce(old.version,0),old.fingerprint,current_setting('related.run')::uuid);
    case outcome->>'action' when 'inserted' then inserted:=inserted+1;
      when 'updated' then updated:=updated+1; when 'skipped' then skipped:=skipped+1; end case;
  end loop;
  return jsonb_build_object('inserted',inserted,'updated',updated,'skipped',skipped);
end;
$$;
create function pg_temp.related_reconcile(records jsonb) returns jsonb language plpgsql as $$
declare r jsonb; row_value private.migration_records; expected jsonb; actual jsonb; ok boolean;
  details jsonb:='[]'; missing jsonb:='[]'; mismatched jsonb:='[]'; extra jsonb; duplicates jsonb;
  history_count bigint; history_ok boolean;
begin
  select coalesce(jsonb_agg(k),'[]') into duplicates from(select x->>'id' k from jsonb_array_elements(records) x group by x->>'id' having count(*)>1) d;
  for r in select value from jsonb_array_elements(records) loop
    select * into row_value from private.migration_records where id=(r->>'id')::uuid;
    if not found then missing:=missing||jsonb_build_array(r->>'id'); continue; end if;
    expected:=jsonb_build_object('id',r->>'id','organization_id',r->>'org','environment',r->>'environment',
      'store',r->>'store','key',r->>'key','item',r->>'item','revision',r->'revision',
      'payload',r->'payload','refs',r->'refs','tombstone',r->'tombstone','version',r->'target_version');
    actual:=private.migration_record_state(row_value);
    select count(*),bool_and(v.fingerprint=private.migration_fingerprint(v.snapshot)
      and v.organization_id=row_value.organization_id and v.snapshot->>'id'=row_value.id::text)
      into history_count,history_ok from private.migration_record_versions v where v.record_id=row_value.id;
    ok:=actual=expected and row_value.fingerprint=private.migration_fingerprint(actual)
      and history_count=row_value.version and history_ok
      and exists(select 1 from private.migration_record_versions v where v.record_id=row_value.id
        and v.version=row_value.version and v.snapshot=actual and v.fingerprint=row_value.fingerprint);
    if ok is distinct from true then mismatched:=mismatched||jsonb_build_array(r->>'id'); end if;
    details:=details||jsonb_build_array(jsonb_build_object('store',r->>'store','key',r->>'key','item',r->>'item',
      'target_id',row_value.id,'source_revision',r->'revision','target_version',row_value.version,
      'tombstone',row_value.tombstone,'source_sha256',private.migration_fingerprint(r->'payload'),
      'target_sha256',private.migration_fingerprint(row_value.payload),'references_verified',row_value.schedule_refs=r->'refs',
      'history_versions',history_count,'history_verified',history_ok,'verified',coalesce(ok,false)));
  end loop;
  select coalesce(jsonb_agg(extra_row.id order by extra_row.id),'[]') into extra from private.migration_records extra_row
    where extra_row.organization_id=current_setting('related.org')::uuid
      and not exists(select 1 from jsonb_array_elements(records) item where item->>'id'=extra_row.id::text);
  return jsonb_build_object('records',details,'missing',missing,'mismatched',mismatched,'duplicates',duplicates,'unexpected',extra,
    'failed','[]'::jsonb,'catalogue_verified',missing='[]'::jsonb and mismatched='[]'::jsonb and duplicates='[]'::jsonb and extra='[]'::jsonb,
    'application_parity',false,'migration_complete',false);
end;
$$;
create function pg_temp.related_state() returns jsonb language sql as $$
 select jsonb_build_object('records',(select jsonb_agg(to_jsonb(r) order by id) from private.migration_records r),
   'history',(select jsonb_agg(to_jsonb(v) order by record_id,version) from private.migration_record_versions v));
$$;
create function pg_temp.related_refuses(records jsonb, documents jsonb) returns jsonb language plpgsql as $$
declare before_state jsonb:=pg_temp.related_state(); rejected boolean:=false;
begin
  begin perform pg_temp.related_import(records,documents); exception when others then rejected:=true; end;
  if not rejected or before_state is distinct from pg_temp.related_state() then raise exception 'Atomic refusal failed'; end if;
  return jsonb_build_object('rejected',true,'records_history_unchanged',true);
end;
$$;

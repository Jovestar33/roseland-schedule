-- Additive contract for the explicitly enabled, loopback-only editor rehearsal.
-- Existing RPCs retain their contract; this is not a global session-policy rollout.
create function public.require_active_schedule_session()
returns void language plpgsql security definer set search_path = '' as $$
declare claims jsonb := auth.jwt(); session_end timestamptz;
begin
  if auth.uid() is null or coalesce(claims->>'session_id','') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then
    raise sqlstate 'PT401' using message = 'Active session required';
  end if;
  if (claims->>'exp')::bigint <= extract(epoch from clock_timestamp()) then
    raise sqlstate 'PT401' using message = 'Active session required';
  end if;
  -- SHARE serializes a save with session deletion/revocation and expiry changes.
  select s.not_after into session_end from auth.sessions s where s.id = (claims->>'session_id')::uuid
    and s.user_id = auth.uid()
    for share;
  if not found or session_end <= clock_timestamp()
    or (claims->>'exp')::bigint <= extract(epoch from clock_timestamp()) then
    raise sqlstate 'PT401' using message = 'Active session required';
  end if;
end;
$$;

create function public.session_read_schedule(target_schedule_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform public.require_active_schedule_session();
  return public.read_schedule(target_schedule_id);
end;
$$;

create function public.session_update_schedule_document(
  target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform public.require_active_schedule_session();
  return public.update_schedule_document(target_schedule_id, expected_version, next_document, schema_version);
end;
$$;

create function public.session_list_schedules(after_id uuid default null, page_size integer default 50)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  perform public.require_active_schedule_session();
  if page_size is null or page_size < 1 or page_size > 100 then
    raise sqlstate 'PT400' using message = 'Invalid page size';
  end if;
  -- RLS applies current membership and active-parent rules. Stable UUID cursor;
  -- listing is live, not a cross-page snapshot, and omits deleted documents.
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.id), '[]'::jsonb) into result from (
    select s.id, s.display_name, s.status, s.document_version, s.updated_at
    from public.schedules s where s.deleted_at is null and (after_id is null or s.id > after_id)
    order by s.id limit page_size
  ) summary;
  return result;
end;
$$;

revoke all on function public.require_active_schedule_session() from public, anon, service_role;
revoke all on function public.session_read_schedule(uuid) from public, anon, service_role;
revoke all on function public.session_update_schedule_document(uuid,bigint,jsonb,integer) from public, anon, service_role;
revoke all on function public.session_list_schedules(uuid,integer) from public, anon, service_role;
grant execute on function public.require_active_schedule_session() to authenticated;
grant execute on function public.session_read_schedule(uuid) to authenticated;
grant execute on function public.session_update_schedule_document(uuid,bigint,jsonb,integer) to authenticated;
grant execute on function public.session_list_schedules(uuid,integer) to authenticated;

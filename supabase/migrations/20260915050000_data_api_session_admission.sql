-- One Data API admission boundary for authenticated RPCs and direct RLS routes.
-- This does not change trusted SQL, Auth, Storage or Realtime policy. Reads
-- admitted before revocation can finish; writes serialize with session deletion.
create function private.require_request_session(actor uuid, session_id uuid, expires_at bigint)
returns void language plpgsql security definer set search_path='' as $$
declare session_end timestamptz; exists_session boolean;
begin
  if actor is null or session_id is null or expires_at is null
    or expires_at <= extract(epoch from clock_timestamp()) then
    raise sqlstate 'PT401' using message='Active session required';
  end if;
  -- PostgREST GET/HEAD transactions are READ ONLY: they cannot take row locks.
  -- Their session check is an admission-time snapshot, not read cancellation.
  if current_setting('transaction_read_only')='on' then
    select s.not_after into session_end from auth.sessions s where s.id=session_id and s.user_id=actor;
  else
    select s.not_after into session_end from auth.sessions s where s.id=session_id and s.user_id=actor for share;
  end if;
  exists_session:=found;
  -- Recheck the clock after acquiring any contended session lock.
  if not exists_session or session_end<=clock_timestamp()
    or expires_at<=extract(epoch from clock_timestamp()) then
    raise sqlstate 'PT401' using message='Active session required';
  end if;
end;$$;
revoke all on function private.require_request_session(uuid,uuid,bigint) from public,anon,authenticated,service_role;

create or replace function public.require_active_schedule_session()
returns void language plpgsql security definer set search_path='' as $$
declare claims jsonb:=auth.jwt();
begin
  if auth.uid() is null or coalesce(claims->>'session_id','') !~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(claims->>'exp','') !~ '^[0-9]{1,12}$' then
    raise sqlstate 'PT401' using message='Active session required';
  end if;
  perform private.require_request_session(auth.uid(),(claims->>'session_id')::uuid,(claims->>'exp')::bigint);
end;$$;

-- Trusted server workflows still authorize their actor/AAL/permissions. This
-- guard keeps the verified actor's session alive through the workflow transaction.
create function public.require_service_actor_session(actor uuid, session_id uuid, expires_at bigint)
returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_request_session(actor,session_id,expires_at);end;$$;
revoke all on function public.require_service_actor_session(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.require_service_actor_session(uuid,uuid,bigint) to service_role;

create function public.check_application_session()
returns void language plpgsql security invoker set search_path='' as $$
declare headers jsonb;
begin
  if current_user='authenticated' then
    perform public.require_active_schedule_session();
  elsif current_user='service_role' and current_setting('request.path',true)=any(array[
    '/rpc/provision_customer_organization','/rpc/create_organization_invitation','/rpc/revoke_organization_invitation'
  ]) then
    headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
    if coalesce(headers->>'x-actor-session-exp','') !~ '^[0-9]{1,12}$' then
      raise sqlstate 'PT401' using message='Active session required';
    end if;
    begin
      perform public.require_service_actor_session((headers->>'x-actor-user-id')::uuid,
        (headers->>'x-actor-session-id')::uuid,(headers->>'x-actor-session-exp')::bigint);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise sqlstate 'PT401' using message='Active session required';
    end;
  end if;
end;$$;
revoke all on function public.check_application_session() from public;
grant execute on function public.check_application_session() to anon,authenticated,service_role;

-- Never silently replace a separately configured hook. Scope the setting to
-- this database; recovery databases and other local projects are unaffected.
do $$declare configured text; current_db oid;
begin
  select oid into current_db from pg_database where datname=current_database();
  for configured in select setting from pg_db_role_setting r
    cross join lateral unnest(r.setconfig) setting
    where r.setrole=(select oid from pg_roles where rolname='authenticator')
      and r.setdatabase in (0,current_db) and setting like 'pgrst.db_pre_request=%' loop
    if configured not in ('pgrst.db_pre_request=','pgrst.db_pre_request=public.check_application_session') then
      raise exception 'Existing Data API hook requires explicit composition';
    end if;
  end loop;
  execute format('alter role authenticator in database %I set pgrst.db_pre_request = %L',current_database(),'public.check_application_session');
end;$$;
notify pgrst, 'reload config';

-- Opt-in persistence belongs to the current genuine Auth session, never user metadata.
-- Existing sessions keep their one-hour inactivity limit until a fresh sign-in.
create table private.account_session_preferences (
 session_id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 remembered boolean not null
);
alter table private.account_session_preferences enable row level security;
revoke all on private.account_session_preferences from public,anon,authenticated,service_role;

create function private.account_session_idle_window(actor uuid,sid uuid) returns interval
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.account_session_preferences p
  where p.session_id=sid and p.user_id=actor and p.remembered)
 then interval '7 days' else interval '60 minutes' end;
$$;
revoke all on function private.account_session_idle_window(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function private.require_current_account_policies(actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Only these narrow account RPCs remain available for review and activity.
 -- request.path is supplied by PostgREST, not a client JSON field/header.
 if coalesce(current_setting('request.path',true),'')=any(array[
  '/rpc/get_my_mfa_status','/rpc/list_my_organization_access','/rpc/get_account_policy_status','/rpc/accept_account_policies',
  '/rpc/get_account_session_deadline','/rpc/record_account_activity','/rpc/set_account_session_remembered'
 ]) then return; end if;
 if exists(select 1 from private.account_policy_versions p where p.id and p.enforce_acceptance
  and not exists(select 1 from private.account_policy_acceptances a where a.user_id=actor
    and a.terms_version=p.terms_version and a.privacy_version=p.privacy_version)) then
  raise sqlstate 'PT428' using message='Review current account policies';
 end if;
end;$$;

create or replace function private.require_request_session(actor uuid,session_id uuid,expires_at bigint)
returns void language plpgsql security definer set search_path='' as $$
declare session_end timestamptz; created timestamptz; activity timestamptz; exists_session boolean;
begin
 if actor is null or session_id is null or expires_at is null or expires_at<=extract(epoch from clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 if current_setting('transaction_read_only')='on' then
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor;
 else
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor for share;
 end if;
 exists_session:=found;
 select a.last_activity_at into activity from private.account_session_activity a where a.session_id=require_request_session.session_id and a.user_id=actor;
 if not exists_session or session_end<=clock_timestamp() or expires_at<=extract(epoch from clock_timestamp())
   or coalesce(activity,created)<=clock_timestamp()-private.account_session_idle_window(actor,session_id)
   or not exists(select 1 from auth.users u where u.id=actor and coalesce(u.banned_until,'-infinity')<=clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 perform private.require_current_account_policies(actor);
 if coalesce(current_setting('request.path',true),'')<>all(array[
  '/rpc/get_my_mfa_status','/rpc/list_my_organization_access','/rpc/get_account_policy_status',
  '/rpc/accept_account_policies','/rpc/get_account_session_deadline','/rpc/record_account_activity','/rpc/set_account_session_remembered'
 ]) and private.account_requires_mfa(actor) and private.request_actor_aal(actor) is distinct from 'aal2' then
  raise sqlstate 'PT403' using message='mfa_required';
 end if;
end;$$;

create or replace function public.get_account_session_deadline() returns timestamptz
language plpgsql security definer set search_path='' as $$
declare result timestamptz;
begin
 perform public.require_active_schedule_session();
 select least(s.not_after,coalesce(a.last_activity_at,s.created_at)+private.account_session_idle_window(auth.uid(),s.id))
 into result from auth.sessions s left join private.account_session_activity a on a.session_id=s.id and a.user_id=s.user_id
 where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid();
 return result;
end;$$;

-- Narrow pre-MFA bootstrap: no account data/authority and no arbitrary actor or session input.
-- Configure once during a fresh password sign-in. Expired sessions cannot reach this RPC.
create function public.set_account_session_remembered(remember boolean) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare sid uuid:=(auth.jwt()->>'session_id')::uuid; previous boolean; created timestamptz;
begin
 perform public.require_active_schedule_session();
 if remember is null then raise sqlstate 'PT400' using message='Choose a session preference'; end if;
 perform pg_advisory_xact_lock(hashtextextended('account-activity:'||sid::text,0));
 perform public.require_active_schedule_session();
 select p.remembered into previous from private.account_session_preferences p where p.session_id=sid and p.user_id=auth.uid();
 if found then
  if previous is distinct from remember then raise sqlstate 'PT409' using message='Sign in again to change this session preference'; end if;
 else
  select s.created_at into created from auth.sessions s where s.id=sid and s.user_id=auth.uid();
  if created is null or created<clock_timestamp()-interval '5 minutes' or not exists(
   select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a
   where a->>'method'='password' and a->>'timestamp' ~ '^[0-9]{1,12}$'
    and (a->>'timestamp')::bigint between extract(epoch from clock_timestamp())-300 and extract(epoch from clock_timestamp())+60
  ) then raise sqlstate 'PT403' using message='Sign in again to choose a session preference'; end if;
  insert into private.account_session_preferences(session_id,user_id,remembered) values(sid,auth.uid(),remember);
 end if;
 return public.get_account_session_deadline();
end;$$;
revoke all on function public.set_account_session_remembered(boolean) from public,anon,service_role;
grant execute on function public.set_account_session_remembered(boolean) to authenticated;
notify pgrst,'reload schema';

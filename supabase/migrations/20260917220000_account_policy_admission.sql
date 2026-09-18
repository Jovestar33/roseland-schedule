-- Explicit rollout gate: older rehearsal stacks keep their accepted behavior.
-- B08 setup enables this only in its isolated local database. Hosted enablement
-- requires approved legal text and a reviewed existing-account rollout.
alter table private.account_policy_versions add column enforce_acceptance boolean not null default false;

create function private.require_current_account_policies(actor uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Only these narrow account RPCs remain available for review and activity.
 -- request.path is supplied by PostgREST, not a client JSON field/header.
 if coalesce(current_setting('request.path',true),'')=any(array[
  '/rpc/get_account_policy_status','/rpc/accept_account_policies',
  '/rpc/get_account_session_deadline','/rpc/record_account_activity'
 ]) then return; end if;
 if exists(select 1 from private.account_policy_versions p where p.id and p.enforce_acceptance
  and not exists(select 1 from private.account_policy_acceptances a where a.user_id=actor
    and a.terms_version=p.terms_version and a.privacy_version=p.privacy_version)) then
  raise sqlstate 'PT428' using message='Review current account policies';
 end if;
end;$$;
revoke all on function private.require_current_account_policies(uuid) from public,anon,authenticated,service_role;

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
   or coalesce(activity,created)<=clock_timestamp()-interval '60 minutes'
   or not exists(select 1 from auth.users u where u.id=actor and coalesce(u.banned_until,'-infinity')<=clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 perform private.require_current_account_policies(actor);
end;$$;


create function public.get_local_account_policy_configuration() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enforce_acceptance,'termsVersion',terms_version,'privacyVersion',privacy_version)
 from private.account_policy_versions where id;
$$;
revoke all on function public.get_local_account_policy_configuration() from public,anon,authenticated;
grant execute on function public.get_local_account_policy_configuration() to service_role;
notify pgrst,'reload schema';

create schema if not exists platform_console_private;
revoke all on schema platform_console_private from public,anon,authenticated;
-- Read-only platform metadata. No tenant content, membership grants, or billing writes.
create or replace function platform_console_private.read_platform_console(
 p_actor_user_id uuid,p_actor_aal text,p_actor_authenticated_at timestamptz,
 p_view text,p_after_id uuid default null,p_search text default ''
) returns jsonb language plpgsql security definer set search_path='' as $$
declare headers jsonb; allowed boolean; rows jsonb;
begin
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 if auth.jwt()->>'role' is distinct from 'service_role'
  or (auth.uid() is not null and auth.uid() is distinct from p_actor_user_id)
  or p_actor_user_id is null
  or private.request_actor() is distinct from p_actor_user_id
  or private.request_actor_aal(p_actor_user_id) is distinct from 'aal2'
  or p_actor_aal is distinct from 'aal2' then
  raise sqlstate 'PT403' using message='Platform access unavailable';
 end if;
 if coalesce(headers->>'x-actor-session-exp','') !~ '^[0-9]{1,12}$' then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 begin
  perform private.require_request_session(p_actor_user_id,(headers->>'x-actor-session-id')::uuid,(headers->>'x-actor-session-exp')::bigint);
 exception when invalid_text_representation or numeric_value_out_of_range then
  raise sqlstate 'PT401' using message='Active session required';
 end;
 select exists(select 1 from private.platform_operators where user_id=p_actor_user_id and active and role='superadmin') into allowed;
 if p_view='access' then return jsonb_build_object('authorized',allowed,'actorId',p_actor_user_id); end if;
 if not allowed then raise sqlstate 'PT403' using message='Platform access unavailable'; end if;
 if p_view is distinct from 'organizations' or p_search is null or char_length(p_search)>100 then
  raise sqlstate 'PT400' using message='Invalid console request';
 end if;
 if p_actor_authenticated_at is null or p_actor_authenticated_at<clock_timestamp()-interval '15 minutes'
  or p_actor_authenticated_at>clock_timestamp()+interval '1 minute' then
  raise sqlstate 'PT403' using message='Recent authentication is required';
 end if;
 select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') into rows from (
  select o.id,o.name,o.slug,o.default_timezone as timezone,o.created_at,
   case when o.deleted_at is not null then 'deleted'
    when l.cancelled_at is null and l.organization_id is not null and l.cancel_before<=clock_timestamp() then 'awaiting_deletion'
    when l.cancelled_at is null and l.organization_id is not null then 'pending_deletion' else 'active' end as status,
   case when l.cancelled_at is null then l.cancel_before end as recovery_deadline,
   o.deleted_at is null and exists(select 1 from public.organization_memberships m where m.organization_id=o.id and m.user_id=p_actor_user_id and m.status='active') as can_open
  from public.organizations o left join private.organization_lifecycle l on l.organization_id=o.id
  where (p_after_id is null or o.id>p_after_id)
   and (btrim(p_search)='' or position(lower(btrim(p_search)) in lower(o.name||' '||o.slug))>0)
  order by o.id limit 26
 ) page;
 return jsonb_build_object('authorized',true,'actorId',p_actor_user_id,'organizations',rows);
end;$$;
revoke all on function platform_console_private.read_platform_console(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
grant usage on schema platform_console_private to service_role;
grant execute on function platform_console_private.read_platform_console(uuid,text,timestamptz,text,uuid,text) to service_role;

-- Exposed wrapper cannot elevate the caller. Only the verified server can execute it.
create or replace function public.read_platform_console(
 p_actor_user_id uuid,p_actor_aal text,p_actor_authenticated_at timestamptz,
 p_view text,p_after_id uuid default null,p_search text default ''
) returns jsonb language sql security invoker set search_path='' as $$
 select platform_console_private.read_platform_console(p_actor_user_id,p_actor_aal,p_actor_authenticated_at,p_view,p_after_id,p_search);
$$;
revoke all on function public.read_platform_console(uuid,text,timestamptz,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.read_platform_console(uuid,text,timestamptz,text,uuid,text) to service_role;
notify pgrst,'reload schema';

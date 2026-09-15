-- Bind idempotency keys to canonical business inputs and serialize each existing
-- rate bucket. Historical requests have unknown inputs and fail closed on replay.
alter table private.workflow_requests add column request_fingerprint text
  check (request_fingerprint is null or request_fingerprint ~ '^[0-9a-f]{64}$');

create function private.workflow_fingerprint(input jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(convert_to(input::text,'UTF8'),'sha256'),'hex');
$$;
revoke all on function private.workflow_fingerprint(jsonb) from public,anon,authenticated,service_role;

create function private.lock_workflow_rate(action text, actor uuid, organization uuid)
returns void language sql set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('workflow.rate:'||action||':'||actor::text||':'||coalesce(organization::text,'global'),0));
$$;
revoke all on function private.lock_workflow_rate(text,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.provision_customer_organization(
  p_actor_user_id uuid,
  p_owner_user_id uuid,
  p_organization_name text,
  p_organization_slug text,
  p_organization_timezone text,
  p_organization_locale text,
  p_organization_country_code text,
  p_organization_currency text,
  p_operator_reason text,
  p_actor_aal text,
  p_actor_authenticated_at timestamptz,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_actor uuid;
  v_existing_resource uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_rate_now timestamptz;
  v_organization_id uuid;
  v_now timestamptz := now();
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or p_operator_reason is null
    or char_length(btrim(p_operator_reason)) not between 1 and 500 then
    raise exception 'organization workflow unavailable';
  end if;

  if not exists (
    select 1
    from private.platform_operators po
    where po.user_id = p_actor_user_id
      and po.active
      and po.role = 'superadmin'
  )
    or p_actor_aal is distinct from 'aal2'
    or p_actor_authenticated_at is null
    or p_actor_authenticated_at < v_now - interval '15 minutes'
    or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'organization workflow unavailable';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_owner_user_id
      and u.email_confirmed_at is not null
      and not coalesce(u.is_anonymous, false)
  ) then
    raise exception 'organization workflow unavailable';
  end if;

  v_fingerprint := private.workflow_fingerprint(jsonb_build_object('owner',p_owner_user_id,'name',p_organization_name,'slug',p_organization_slug,'timezone',p_organization_timezone,'locale',p_organization_locale,'country',p_organization_country_code,'currency',p_organization_currency,'reason',btrim(p_operator_reason)));

  perform pg_advisory_xact_lock(hashtext('organization.provisioned:' || p_request_id));

  select wr.actor_user_id, wr.resource_id, wr.request_fingerprint
    into v_existing_actor, v_existing_resource, v_existing_fingerprint
  from private.workflow_requests wr
  where wr.action = 'organization.provisioned'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor is distinct from p_actor_user_id then
      raise exception 'organization workflow unavailable';
    end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise sqlstate 'PT409' using message='Workflow request conflict';
    end if;
    return v_existing_resource;
  end if;

  perform private.lock_workflow_rate('organization.provisioned',p_actor_user_id,null);
  v_rate_now := clock_timestamp();

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.action = 'organization.provisioned'
      and ae.created_at > v_rate_now - interval '1 hour'
  ) >= 10 then
    raise exception 'workflow rate limit exceeded';
  end if;

  insert into public.organizations (
    name,
    slug,
    default_timezone,
    default_locale,
    default_country_code,
    default_currency,
    created_by,
    updated_by
  )
  values (
    p_organization_name,
    p_organization_slug,
    p_organization_timezone,
    p_organization_locale,
    p_organization_country_code,
    p_organization_currency,
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into v_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    v_organization_id,
    p_owner_user_id,
    'owner',
    'active',
    p_actor_user_id,
    v_now
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    created_at,
    metadata
  )
  values (
    v_organization_id,
    p_actor_user_id,
    'organization.provisioned',
    'organization',
    v_organization_id,
    p_request_id,
    v_rate_now,
    jsonb_build_object(
      'owner_user_id', p_owner_user_id,
      'operator_reason', btrim(p_operator_reason),
      'operator_aal', p_actor_aal
    )
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id, request_fingerprint)
  values ('organization.provisioned', p_request_id, p_actor_user_id, v_organization_id, v_fingerprint);

  return v_organization_id;
end;
$$;

create or replace function private.create_organization_invitation_request(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_organization_role public.organization_role,
  p_production_id uuid,
  p_production_role public.production_role,
  p_expires_at timestamptz,
  p_actor_aal text,
  p_actor_authenticated_at timestamptz,
  p_request_id text,
  p_request_expiry jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.organization_role;
  v_existing_actor uuid;
  v_existing_resource uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_rate_now timestamptz;
  v_invitation_id uuid;
  v_recipient_user_id uuid;
  v_now timestamptz := now();
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or p_email is null
    or char_length(btrim(p_email)) not between 3 and 320
    or position('@' in p_email) <= 1
    or p_expires_at is null
    or p_expires_at <= v_now + interval '5 minutes'
    or p_expires_at > v_now + interval '720 hours'
    or ((p_production_id is null) <> (p_production_role is null))
    or p_actor_aal is distinct from 'aal2'
    or p_actor_authenticated_at is null
    or p_actor_authenticated_at < v_now - interval '30 minutes'
    or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'invitation workflow unavailable';
  end if;

  select m.role into v_actor_role
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = p_organization_id
    and m.user_id = p_actor_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin')
    and o.deleted_at is null;

  if not found
    or (p_organization_role in ('owner', 'admin') and v_actor_role <> 'owner') then
    raise exception 'invitation workflow unavailable';
  end if;

  if p_production_id is not null
    and not exists (
      select 1
      from public.productions p
      where p.id = p_production_id
        and p.organization_id = p_organization_id
        and p.deleted_at is null
    ) then
    raise exception 'invitation workflow unavailable';
  end if;

  v_fingerprint := private.workflow_fingerprint(jsonb_build_object('organization',p_organization_id,'email',lower(btrim(p_email)),'role',p_organization_role,'production',p_production_id,'production_role',p_production_role,'expiry',p_request_expiry));

  perform pg_advisory_xact_lock(hashtext('organization.invitation.created:' || p_request_id));

  select wr.actor_user_id, wr.resource_id, wr.request_fingerprint
    into v_existing_actor, v_existing_resource, v_existing_fingerprint
  from private.workflow_requests wr
  where wr.action = 'organization.invitation.created'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor is distinct from p_actor_user_id then
      raise exception 'invitation workflow unavailable';
    end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise sqlstate 'PT409' using message='Workflow request conflict';
    end if;
    return v_existing_resource;
  end if;

  select u.id into v_recipient_user_id
  from auth.users u
  where lower(btrim(coalesce(u.email, ''))) = lower(btrim(p_email))
    and u.email_confirmed_at is not null
  limit 1;

  if v_recipient_user_id is not null then
    if p_production_id is null and exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = p_organization_id
        and m.user_id = v_recipient_user_id
        and m.status = 'active'
    ) then
      raise exception 'invitation workflow unavailable';
    end if;

    if p_production_id is not null and exists (
      select 1
      from public.production_memberships pm
      where pm.production_id = p_production_id
        and pm.user_id = v_recipient_user_id
        and pm.status = 'active'
    ) then
      raise exception 'invitation workflow unavailable';
    end if;
  end if;

  perform private.lock_workflow_rate('organization.invitation.created',p_actor_user_id,p_organization_id);
  v_rate_now := clock_timestamp();

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.organization_id = p_organization_id
      and ae.action = 'organization.invitation.created'
      and ae.created_at > v_rate_now - interval '10 minutes'
  ) >= 25 then
    raise exception 'workflow rate limit exceeded';
  end if;

  begin
    insert into public.organization_invitations (
      organization_id,
      email,
      organization_role,
      production_id,
      production_role,
      expires_at,
      created_by
    )
    values (
      p_organization_id,
      btrim(p_email),
      p_organization_role,
      p_production_id,
      p_production_role,
      p_expires_at,
      p_actor_user_id
    )
    returning id into v_invitation_id;
  exception when unique_violation then
    raise exception 'invitation workflow unavailable';
  end;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    created_at,
    metadata
  )
  values (
    p_organization_id,
    p_actor_user_id,
    'organization.invitation.created',
    'organization_invitation',
    v_invitation_id,
    p_request_id,
    v_rate_now,
    jsonb_build_object(
      'organization_role', p_organization_role,
      'production_id', p_production_id,
      'production_role', p_production_role
    )
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id, request_fingerprint)
  values ('organization.invitation.created', p_request_id, p_actor_user_id, v_invitation_id, v_fingerprint);

  return v_invitation_id;
end;
$$;

create or replace function public.revoke_organization_invitation(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_reason text,
  p_actor_aal text,
  p_actor_authenticated_at timestamptz,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_role public.organization_role;
  v_existing_actor uuid;
  v_existing_resource uuid;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_rate_now timestamptz;
  v_invitation public.organization_invitations%rowtype;
  v_organization_id uuid;
  v_now timestamptz := now();
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500
    or p_actor_aal is distinct from 'aal2'
    or p_actor_authenticated_at is null
    or p_actor_authenticated_at < v_now - interval '30 minutes'
    or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'invitation workflow unavailable';
  end if;

  select * into v_invitation
  from public.organization_invitations i
  where i.id = p_invitation_id;

  if not found then
    raise exception 'invitation workflow unavailable';
  end if;
  v_organization_id := v_invitation.organization_id;

  select m.role into v_actor_role
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.organization_id = v_invitation.organization_id
    and m.user_id = p_actor_user_id
    and m.status = 'active'
    and m.role in ('owner', 'admin')
    and o.deleted_at is null;

  if not found
    or (v_invitation.organization_role in ('owner', 'admin') and v_actor_role <> 'owner') then
    raise exception 'invitation workflow unavailable';
  end if;

  v_fingerprint := private.workflow_fingerprint(jsonb_build_object('invitation',p_invitation_id,'organization',v_invitation.organization_id,'reason',btrim(p_reason)));

  perform pg_advisory_xact_lock(hashtext('organization.invitation.revoked:' || p_request_id));

  select wr.actor_user_id, wr.resource_id, wr.request_fingerprint
    into v_existing_actor, v_existing_resource, v_existing_fingerprint
  from private.workflow_requests wr
  where wr.action = 'organization.invitation.revoked'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor is distinct from p_actor_user_id then
      raise exception 'invitation workflow unavailable';
    end if;
    if v_existing_fingerprint is distinct from v_fingerprint then
      raise sqlstate 'PT409' using message='Workflow request conflict';
    end if;
    return v_existing_resource;
  end if;

  perform private.lock_workflow_rate('organization.invitation.revoked',p_actor_user_id,v_invitation.organization_id);
  v_rate_now := clock_timestamp();

  select * into v_invitation from public.organization_invitations
  where id=p_invitation_id and organization_id=v_organization_id for update;
  if not found then raise exception 'invitation workflow unavailable'; end if;

  if v_invitation.status <> 'pending' then
    raise exception 'invitation workflow unavailable';
  end if;

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.organization_id = v_invitation.organization_id
      and ae.action = 'organization.invitation.revoked'
      and ae.created_at > v_rate_now - interval '10 minutes'
  ) >= 50 then
    raise exception 'workflow rate limit exceeded';
  end if;

  update public.organization_invitations
  set status = 'revoked',
      revoked_at = v_now,
      revoked_by = p_actor_user_id
  where id = v_invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    created_at,
    metadata
  )
  values (
    v_invitation.organization_id,
    p_actor_user_id,
    'organization.invitation.revoked',
    'organization_invitation',
    v_invitation.id,
    p_request_id,
    v_rate_now,
    jsonb_build_object('reason', btrim(p_reason))
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id, request_fingerprint)
  values ('organization.invitation.revoked', p_request_id, p_actor_user_id, v_invitation.id, v_fingerprint);

  return v_invitation.id;
end;
$$;

-- Preserve the existing absolute-expiry SQL/HTTP signature. Its fingerprint
-- uses the actual instant rather than the connection's timestamp text format.
create or replace function public.create_organization_invitation(
  p_actor_user_id uuid, p_organization_id uuid, p_email text,
  p_organization_role public.organization_role, p_production_id uuid,
  p_production_role public.production_role, p_expires_at timestamptz,
  p_actor_aal text, p_actor_authenticated_at timestamptz, p_request_id text
) returns uuid language sql security definer set search_path='' as $$
  select private.create_organization_invitation_request(
    p_actor_user_id,p_organization_id,p_email,p_organization_role,p_production_id,
    p_production_role,p_expires_at,p_actor_aal,p_actor_authenticated_at,p_request_id,
    jsonb_build_object('at_epoch',extract(epoch from p_expires_at)));
$$;

-- The application already accepts expiresInDays. Keep this business input
-- stable across retries instead of hashing a freshly computed client timestamp.
-- A distinct name also preserves positional legacy timestamp-literal calls.
create function public.create_organization_invitation_with_days(
  p_actor_user_id uuid, p_organization_id uuid, p_email text,
  p_organization_role public.organization_role, p_production_id uuid,
  p_production_role public.production_role, p_expires_in_days integer,
  p_actor_aal text, p_actor_authenticated_at timestamptz, p_request_id text
) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if p_expires_in_days is null or p_expires_in_days not between 1 and 30 then
    raise exception 'invitation workflow unavailable';
  end if;
  return private.create_organization_invitation_request(
    p_actor_user_id,p_organization_id,p_email,p_organization_role,p_production_id,
    p_production_role,now()+p_expires_in_days*interval '24 hours',p_actor_aal,p_actor_authenticated_at,p_request_id,
    jsonb_build_object('in_days',p_expires_in_days));
end;$$;
revoke all on function public.create_organization_invitation_with_days(uuid,uuid,text,public.organization_role,uuid,public.production_role,integer,text,timestamptz,text)
  from public,anon,authenticated;
grant execute on function public.create_organization_invitation_with_days(uuid,uuid,text,public.organization_role,uuid,public.production_role,integer,text,timestamptz,text)
  to service_role;
revoke all on function private.create_organization_invitation_request(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text,jsonb)
  from public,anon,authenticated,service_role;

-- The additive days endpoint uses the same verified actor-session boundary.
create or replace function public.check_application_session()
returns void language plpgsql security invoker set search_path='' as $$
declare headers jsonb;
begin
  if current_user='authenticated' then
    perform public.require_active_schedule_session();
  elsif current_user='service_role' and current_setting('request.path',true)=any(array[
    '/rpc/provision_customer_organization','/rpc/create_organization_invitation','/rpc/create_organization_invitation_with_days','/rpc/revoke_organization_invitation'
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
notify pgrst, 'reload schema';

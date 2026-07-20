-- Server-controlled organization provisioning and invitation administration.
-- Every function is restricted to the server secret/service role and performs
-- its own actor authorization before mutating tenant data.

create table private.workflow_requests (
  action text not null check (char_length(btrim(action)) between 3 and 120),
  request_id text not null check (
    char_length(request_id) between 8 and 160
    and request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
  ),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  resource_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (action, request_id)
);

create index workflow_requests_actor_created_idx
  on private.workflow_requests (actor_user_id, created_at desc);

alter table private.workflow_requests enable row level security;
revoke all on table private.workflow_requests from public, anon, authenticated;

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
  v_organization_id uuid;
  v_now timestamptz := timezone('utc', now());
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
    or p_actor_aal <> 'aal2'
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

  perform pg_advisory_xact_lock(hashtext('organization.provisioned:' || p_request_id));

  select wr.actor_user_id, wr.resource_id
    into v_existing_actor, v_existing_resource
  from private.workflow_requests wr
  where wr.action = 'organization.provisioned'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor <> p_actor_user_id then
      raise exception 'organization workflow unavailable';
    end if;
    return v_existing_resource;
  end if;

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.action = 'organization.provisioned'
      and ae.created_at > v_now - interval '1 hour'
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
    metadata
  )
  values (
    v_organization_id,
    p_actor_user_id,
    'organization.provisioned',
    'organization',
    v_organization_id,
    p_request_id,
    jsonb_build_object(
      'owner_user_id', p_owner_user_id,
      'operator_reason', btrim(p_operator_reason),
      'operator_aal', p_actor_aal
    )
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id)
  values ('organization.provisioned', p_request_id, p_actor_user_id, v_organization_id);

  return v_organization_id;
end;
$$;

create or replace function public.create_organization_invitation(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_email text,
  p_organization_role public.organization_role,
  p_production_id uuid,
  p_production_role public.production_role,
  p_expires_at timestamptz,
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
  v_invitation_id uuid;
  v_recipient_user_id uuid;
  v_now timestamptz := timezone('utc', now());
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or p_email is null
    or char_length(btrim(p_email)) not between 3 and 320
    or position('@' in p_email) <= 1
    or p_expires_at is null
    or p_expires_at <= v_now + interval '5 minutes'
    or p_expires_at > v_now + interval '30 days'
    or ((p_production_id is null) <> (p_production_role is null))
    or p_actor_aal <> 'aal2'
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

  perform pg_advisory_xact_lock(hashtext('organization.invitation.created:' || p_request_id));

  select wr.actor_user_id, wr.resource_id
    into v_existing_actor, v_existing_resource
  from private.workflow_requests wr
  where wr.action = 'organization.invitation.created'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor <> p_actor_user_id then
      raise exception 'invitation workflow unavailable';
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

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.organization_id = p_organization_id
      and ae.action = 'organization.invitation.created'
      and ae.created_at > v_now - interval '10 minutes'
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
    metadata
  )
  values (
    p_organization_id,
    p_actor_user_id,
    'organization.invitation.created',
    'organization_invitation',
    v_invitation_id,
    p_request_id,
    jsonb_build_object(
      'organization_role', p_organization_role,
      'production_id', p_production_id,
      'production_role', p_production_role
    )
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id)
  values ('organization.invitation.created', p_request_id, p_actor_user_id, v_invitation_id);

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
  v_invitation public.organization_invitations%rowtype;
  v_now timestamptz := timezone('utc', now());
begin
  if p_request_id is null
    or char_length(p_request_id) not between 8 and 160
    or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500
    or p_actor_aal <> 'aal2'
    or p_actor_authenticated_at is null
    or p_actor_authenticated_at < v_now - interval '30 minutes'
    or p_actor_authenticated_at > v_now + interval '1 minute' then
    raise exception 'invitation workflow unavailable';
  end if;

  select * into v_invitation
  from public.organization_invitations i
  where i.id = p_invitation_id
  for update;

  if not found then
    raise exception 'invitation workflow unavailable';
  end if;

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

  perform pg_advisory_xact_lock(hashtext('organization.invitation.revoked:' || p_request_id));

  select wr.actor_user_id, wr.resource_id
    into v_existing_actor, v_existing_resource
  from private.workflow_requests wr
  where wr.action = 'organization.invitation.revoked'
    and wr.request_id = p_request_id;

  if found then
    if v_existing_actor <> p_actor_user_id then
      raise exception 'invitation workflow unavailable';
    end if;
    return v_existing_resource;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'invitation workflow unavailable';
  end if;

  if (
    select count(*)
    from public.audit_events ae
    where ae.actor_user_id = p_actor_user_id
      and ae.organization_id = v_invitation.organization_id
      and ae.action = 'organization.invitation.revoked'
      and ae.created_at > v_now - interval '10 minutes'
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
    metadata
  )
  values (
    v_invitation.organization_id,
    p_actor_user_id,
    'organization.invitation.revoked',
    'organization_invitation',
    v_invitation.id,
    p_request_id,
    jsonb_build_object('reason', btrim(p_reason))
  );

  insert into private.workflow_requests (action, request_id, actor_user_id, resource_id)
  values ('organization.invitation.revoked', p_request_id, p_actor_user_id, v_invitation.id);

  return v_invitation.id;
end;
$$;

revoke all on function public.provision_customer_organization(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.provision_customer_organization(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text
) to service_role;

revoke all on function public.create_organization_invitation(
  uuid, uuid, text, public.organization_role, uuid, public.production_role, timestamptz, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(
  uuid, uuid, text, public.organization_role, uuid, public.production_role, timestamptz, text, timestamptz, text
) to service_role;

revoke all on function public.revoke_organization_invitation(
  uuid, uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.revoke_organization_invitation(
  uuid, uuid, text, text, timestamptz, text
) to service_role;

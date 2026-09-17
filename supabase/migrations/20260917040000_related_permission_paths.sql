-- Apply restrictive checks to related metadata and trusted invitation entry points.
alter policy productions_select_authorized on public.productions using(public.can_access_production(id) and public.schedule_capability('discover',id));
alter policy productions_update_authorized_editors on public.productions using(public.schedule_capability('organize',id)) with check(public.schedule_capability('organize',id));
alter policy phases_select_authorized on public.phases using(public.schedule_capability('read',production_id));
alter policy production_days_select_authorized on public.production_days using(public.schedule_capability('read',production_id));

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

  perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||p_organization_id::text,0));
  if not private.schedule_actor_can(p_actor_user_id,'permissions',p_organization_id,p_production_id,null) then raise exception 'invitation workflow unavailable'; end if;
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

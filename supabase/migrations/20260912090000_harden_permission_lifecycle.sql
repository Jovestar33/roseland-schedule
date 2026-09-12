-- Forward-only permission lifecycle hardening. Apply to local test databases first.
-- Existing function signatures/grants and editor storage remain unchanged.


create or replace function public.is_active_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.deleted_at is null
  );
$$;

create or replace function public.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and o.deleted_at is null
      and m.role in ('owner', 'admin')
  );
$$;

-- Membership metadata must not outlive organization access, including the self-row path.
alter policy organization_memberships_select on public.organization_memberships
  using (public.is_active_org_member(organization_id)
    and (user_id = auth.uid() or public.is_org_admin(organization_id)));


create or replace function public.accept_organization_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_email text;
  invitation public.organization_invitations%rowtype;
  locked_invitation public.organization_invitations%rowtype;
begin
  if caller_user_id is null then
    raise exception 'invitation unavailable';
  end if;

  select lower(btrim(coalesce(u.email, ''))) into caller_email
  from auth.users u
  where u.id = caller_user_id
    and u.email_confirmed_at is not null;

  if caller_email is null or caller_email = '' then
    raise exception 'invitation unavailable';
  end if;

  select * into invitation
  from public.organization_invitations i
  where i.id = invitation_id;

  if not found
    or invitation.status <> 'pending'
    or invitation.expires_at <= timezone('utc', now())
    or invitation.email_normalized <> caller_email
    or not exists (
      select 1 from public.organizations o
      where o.id = invitation.organization_id and o.deleted_at is null
    )
    or (
      invitation.production_id is not null
      and not exists (
        select 1 from public.productions p
        where p.id = invitation.production_id
          and p.organization_id = invitation.organization_id
          and p.deleted_at is null
      )
    ) then
    raise exception 'invitation unavailable';
  end if;

  -- Hold active parents through acceptance. Do not hold the invitation while
  -- waiting for memberships: suspension locks a membership before invalidating
  -- invitations. Upserts below obtain row locks even for concurrently created rows.
  perform 1 from public.organizations o
  where o.id = invitation.organization_id and o.deleted_at is null for share;
  if not found then raise exception 'invitation unavailable'; end if;
  if invitation.production_id is not null then
    perform 1 from public.productions p
    where p.id = invitation.production_id
      and p.organization_id = invitation.organization_id
      and p.deleted_at is null for share;
    if not found then raise exception 'invitation unavailable'; end if;
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    invitation.organization_id,
    caller_user_id,
    invitation.organization_role,
    'active',
    invitation.created_by,
    timezone('utc', now())
  )
  on conflict (organization_id, user_id) do update
  set role = case
      when public.organization_memberships.role = 'owner' then 'owner'::public.organization_role
      when public.organization_memberships.role = 'admin'
        and excluded.role = 'member' then 'admin'::public.organization_role
      else excluded.role
    end,
    status = 'active',
    invited_by = excluded.invited_by,
    joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at),
    updated_at = timezone('utc', now())
  where public.organization_memberships.status <> 'suspended';
  if not found then raise exception 'invitation unavailable'; end if;

  if invitation.production_id is not null then
    insert into public.production_memberships (
      organization_id,
      production_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      invitation.organization_id,
      invitation.production_id,
      caller_user_id,
      invitation.production_role,
      'active',
      invitation.created_by,
      timezone('utc', now())
    )
    on conflict (production_id, user_id) do update
    set role = case
        when public.production_memberships.role = 'editor' then 'editor'::public.production_role
        else excluded.role
      end,
      status = 'active',
      invited_by = excluded.invited_by,
      joined_at = coalesce(public.production_memberships.joined_at, excluded.joined_at),
      updated_at = timezone('utc', now())
    where public.production_memberships.status <> 'suspended';
    if not found then raise exception 'invitation unavailable'; end if;
  end if;

  -- Recheck the whole invitation after obtaining membership locks. A concurrent
  -- accept/revoke/expiry or edit invalidates this attempt and rolls its upserts back.
  select * into locked_invitation from public.organization_invitations i
  where i.id = invitation_id for update;
  if not found or locked_invitation is distinct from invitation
    or locked_invitation.status <> 'pending'
    or locked_invitation.expires_at <= clock_timestamp() then
    raise exception 'invitation unavailable';
  end if;

  update public.organization_invitations
  set status = 'accepted',
      accepted_at = timezone('utc', now()),
      accepted_by = caller_user_id
  where id = invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    invitation.organization_id,
    caller_user_id,
    'organization.invitation.accepted',
    'organization_invitation',
    invitation.id,
    jsonb_build_object('production_id', invitation.production_id)
  );

  return invitation.organization_id;
end;
$$;

-- No reinstatement workflow is introduced. A trusted future workflow must
-- explicitly authorize membership reinstatement; invitation acceptance cannot do it.
-- Use the existing expired terminal state for invalidation: revoked requires a
-- human revoked_by, which system/service suspensions may not have. Audit the reason.
create or replace function private.invalidate_suspended_member_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_production uuid;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'suspended' then return new; end if;
  end if;
  if tg_table_name = 'production_memberships' then
    target_production := new.production_id;
  end if;
  with invalidated as (
    update public.organization_invitations i
    set status = 'expired', updated_at = timezone('utc', now())
    where i.organization_id = new.organization_id
      and i.status = 'pending'
      and (target_production is null or i.production_id = target_production)
      and i.email_normalized = (
        select lower(btrim(u.email)) from auth.users u where u.id = new.user_id
      )
    returning i.id, i.organization_id
  )
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  select organization_id,auth.uid(),'organization.invitation.invalidated',
    'organization_invitation',id,
    jsonb_build_object('reason','membership_suspended','membership_id',new.id,
      'scope',tg_table_name)
  from invalidated;
  return new;
end;
$$;
revoke all on function private.invalidate_suspended_member_invitations()
  from public, anon, authenticated, service_role;

create trigger organization_memberships_invalidate_invitations
  after insert or update of status on public.organization_memberships
  for each row when (new.status = 'suspended')
  execute function private.invalidate_suspended_member_invitations();
create trigger production_memberships_invalidate_invitations
  after insert or update of status on public.production_memberships
  for each row when (new.status = 'suspended')
  execute function private.invalidate_suspended_member_invitations();

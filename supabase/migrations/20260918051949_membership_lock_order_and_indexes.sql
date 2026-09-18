-- Forward-only B10-A lock ordering and lookup indexes.
create index membership_receipts_org on private.membership_status_receipts(organization_id);
create index membership_receipts_actor on private.membership_status_receipts(actor_id);
create index membership_receipts_member on private.membership_status_receipts(membership_id);
create index membership_notices_member_revision on private.administration_notification_outbox(membership_id,membership_revision desc);
create index membership_notices_org on private.administration_notification_outbox(organization_id);
create index membership_notices_actor on private.administration_notification_outbox(actor_id);
create index membership_notices_recipient on private.administration_notification_outbox(recipient_id);
create index membership_notices_claim_actor on private.administration_notification_outbox(claimed_by);
-- Supersedes the original deferred-reinstatement source contract without rewriting history.
comment on function private.invalidate_suspended_member_invitations() is
 'Suspension expires pending invitations. Explicit B10-A membership reinstatement preserves expired invitations and independent restrictions; invitation acceptance cannot reinstate suspended membership.';
-- Keep membership strength when accepting another production invitation.
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

  -- Match membership management's organization-before-member lock order.
  perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||invitation.organization_id::text,0));

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
        when public.production_memberships.role = 'organizer' then 'organizer'::public.production_role
        when public.production_memberships.role = 'editor' and excluded.role <> 'organizer' then 'editor'::public.production_role
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


notify pgrst,'reload schema';

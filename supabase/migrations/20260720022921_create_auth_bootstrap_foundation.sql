-- Authentication/bootstrap foundation. This migration does not replace the
-- live Netlify login and contains no production or seed data.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type private.platform_operator_role as enum ('operator', 'superadmin');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 120),
  preferred_timezone text not null default 'UTC' check (char_length(preferred_timezone) between 1 and 100),
  preferred_locale text not null default 'en' check (char_length(preferred_locale) between 2 and 35),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table private.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role private.platform_operator_role not null,
  active boolean not null default true,
  mfa_required boolean not null default true,
  designation_reason text not null check (char_length(btrim(designation_reason)) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  check ((active and disabled_at is null) or (not active and disabled_at is not null))
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(btrim(email)) between 3 and 320 and position('@' in email) > 1),
  email_normalized text generated always as (lower(btrim(email))) stored,
  organization_role public.organization_role not null default 'member',
  production_id uuid,
  production_role public.production_role,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id) on delete restrict,
  foreign key (organization_id, production_id)
    references public.productions(organization_id, id) on delete cascade,
  check (expires_at > created_at),
  check (
    (production_id is null and production_role is null)
    or (production_id is not null and production_role is not null)
  ),
  check (
    (status = 'pending' and accepted_at is null and accepted_by is null and revoked_at is null and revoked_by is null)
    or (status = 'accepted' and accepted_at is not null and accepted_by is not null and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null and accepted_at is null and accepted_by is null)
    or (status = 'expired' and accepted_at is null and accepted_by is null and revoked_at is null and revoked_by is null)
  )
);

create unique index organization_invitations_one_pending_idx
  on public.organization_invitations (
    organization_id,
    email_normalized,
    coalesce(production_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'pending';
create index organization_invitations_recipient_idx
  on public.organization_invitations (email_normalized, status, expires_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(btrim(action)) between 3 and 120),
  resource_type text not null check (char_length(btrim(resource_type)) between 1 and 80),
  resource_id uuid,
  request_id text check (request_id is null or char_length(request_id) <= 160),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create index audit_events_org_created_idx
  on public.audit_events (organization_id, created_at desc);
create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);
create index audit_events_resource_idx
  on public.audit_events (resource_type, resource_id, created_at desc);

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'profile identity fields cannot be changed';
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_protect_identity before update on public.profiles
  for each row execute function public.protect_profile_identity();
create trigger organization_invitations_set_updated_at before update on public.organization_invitations
  for each row execute function public.set_updated_at();
create trigger auth_users_create_profile after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill is idempotent and matters only if a non-production development user
-- already exists when this migration is applied.
insert into public.profiles (user_id)
select u.id from auth.users u
on conflict (user_id) do nothing;

create or replace function public.bootstrap_first_organization(
  target_user_id uuid,
  organization_name text,
  organization_slug text,
  organization_timezone text default 'UTC',
  organization_locale text default 'en',
  organization_country_code text default null,
  organization_currency text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  -- Serialize first-organization claims even if two server requests race.
  perform pg_advisory_xact_lock(hashtext('roseland:first-organization-bootstrap'));

  if exists (select 1 from public.organizations) then
    raise exception 'platform bootstrap is no longer available';
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'bootstrap user is unavailable';
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
    organization_name,
    organization_slug,
    organization_timezone,
    organization_locale,
    organization_country_code,
    organization_currency,
    target_user_id,
    target_user_id
  )
  returning id into new_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    new_organization_id,
    target_user_id,
    'owner',
    'active',
    timezone('utc', now())
  );

  insert into private.platform_operators (
    user_id,
    role,
    mfa_required,
    designation_reason,
    created_by
  )
  values (
    target_user_id,
    'superadmin',
    true,
    'Initial platform bootstrap operator',
    target_user_id
  );

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    new_organization_id,
    target_user_id,
    'platform.bootstrap.completed',
    'organization',
    new_organization_id,
    jsonb_build_object('operator_role', 'superadmin', 'mfa_required', true)
  );

  return new_organization_id;
end;
$$;

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
  where i.id = invitation_id
  for update;

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
    updated_at = timezone('utc', now());

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
      updated_at = timezone('utc', now());
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

revoke all on function public.bootstrap_first_organization(uuid, text, text, text, text, text, text) from public;
grant execute on function public.bootstrap_first_organization(uuid, text, text, text, text, text, text) to service_role;
revoke all on function public.accept_organization_invitation(uuid) from public;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table private.platform_operators enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_self
  on public.profiles for select to authenticated
  using (user_id = auth.uid());
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy organization_invitations_select_admins
  on public.organization_invitations for select to authenticated
  using (public.is_org_admin(organization_id));

create policy audit_events_select_admins
  on public.audit_events for select to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id));

grant select, update on public.profiles to authenticated;
grant select on public.organization_invitations to authenticated;
grant select on public.audit_events to authenticated;

-- No anon/authenticated grants exist for private.platform_operators, invitation
-- mutation, or audit insertion. These remain server-only workflows.

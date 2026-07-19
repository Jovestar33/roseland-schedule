-- Roseland Schedule tenant foundation.
-- RLS is enabled in the same transaction that creates every exposed table.

create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('owner', 'admin', 'member');
create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.production_role as enum ('editor', 'viewer');
create type public.production_status as enum ('planning', 'active', 'completed', 'archived');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.protect_organization_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'organization identity fields cannot be changed';
  end if;

  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.protect_production_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'production identity fields cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and not public.is_org_admin(old.organization_id) then
    raise exception 'only an organization owner or admin may change production deletion state';
  end if;

  new.version = old.version + 1;
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  default_timezone text not null default 'UTC' check (char_length(default_timezone) between 1 and 100),
  default_locale text not null default 'en' check (char_length(default_locale) between 2 and 35),
  default_country_code text check (default_country_code ~ '^[A-Z]{2}$'),
  default_currency text check (default_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (slug)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'member',
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id),
  check ((status = 'active' and joined_at is not null) or status <> 'active')
);

create table public.productions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.production_status not null default 'planning',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 100),
  locale text not null default 'en' check (char_length(locale) between 2 and 35),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  currency text check (currency ~ '^[A-Z]{3}$'),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (organization_id, slug),
  unique (organization_id, id)
);

create table public.production_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.production_role not null,
  status public.membership_status not null default 'invited',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (production_id, user_id),
  foreign key (production_id) references public.productions(id) on delete cascade,
  foreign key (organization_id, user_id)
    references public.organization_memberships(organization_id, user_id) on delete cascade,
  foreign key (organization_id, production_id)
    references public.productions(organization_id, id) on delete cascade,
  check ((status = 'active' and joined_at is not null) or status <> 'active')
);

create index organization_memberships_user_active_idx
  on public.organization_memberships (user_id, organization_id)
  where status = 'active';
create index productions_org_active_idx
  on public.productions (organization_id, status)
  where deleted_at is null;
create index production_memberships_user_active_idx
  on public.production_memberships (user_id, production_id)
  where status = 'active';

create trigger organizations_protect_identity before update on public.organizations
  for each row execute function public.protect_organization_identity();
create trigger organization_memberships_set_updated_at before update on public.organization_memberships
  for each row execute function public.set_updated_at();
create trigger productions_protect_identity before update on public.productions
  for each row execute function public.protect_production_identity();
create trigger production_memberships_set_updated_at before update on public.production_memberships
  for each row execute function public.set_updated_at();

-- SECURITY DEFINER helpers avoid recursive membership-policy evaluation. They expose
-- booleans only, pin search_path, and are executable solely by authenticated users.
create or replace function public.is_active_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
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
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_access_production(target_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.productions p
    where p.id = target_production_id
      and p.deleted_at is null
      and public.is_active_org_member(p.organization_id)
      and (
        public.is_org_admin(p.organization_id)
        or exists (
          select 1 from public.production_memberships pm
          where pm.production_id = p.id
            and pm.user_id = auth.uid()
            and pm.status = 'active'
        )
      )
  );
$$;

create or replace function public.can_edit_production(target_production_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.productions p
    where p.id = target_production_id
      and p.deleted_at is null
      and public.is_active_org_member(p.organization_id)
      and (
        public.is_org_admin(p.organization_id)
        or exists (
          select 1 from public.production_memberships pm
          where pm.production_id = p.id
            and pm.user_id = auth.uid()
            and pm.status = 'active'
            and pm.role = 'editor'
        )
      )
  );
$$;

revoke all on function public.is_active_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.can_access_production(uuid) from public;
revoke all on function public.can_edit_production(uuid) from public;
grant execute on function public.is_active_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.can_access_production(uuid) to authenticated;
grant execute on function public.can_edit_production(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.productions enable row level security;
alter table public.production_memberships enable row level security;

create policy organizations_select_members
  on public.organizations for select to authenticated
  using (deleted_at is null and public.is_active_org_member(id));
create policy organizations_update_admins
  on public.organizations for update to authenticated
  using (deleted_at is null and public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy organization_memberships_select
  on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

create policy productions_select_authorized
  on public.productions for select to authenticated
  using (public.can_access_production(id));
create policy productions_insert_admins
  on public.productions for insert to authenticated
  with check (public.is_org_admin(organization_id) and created_by = auth.uid());
create policy productions_update_authorized_editors
  on public.productions for update to authenticated
  using (public.can_edit_production(id))
  with check (public.can_edit_production(id) and public.is_active_org_member(organization_id));

create policy production_memberships_select
  on public.production_memberships for select to authenticated
  using (public.can_access_production(production_id));

-- Membership creation/mutation, organization creation, and destructive operations
-- intentionally have no client policies. They are trusted, audited server workflows.

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_memberships to authenticated;
grant select, insert, update, delete on public.productions to authenticated;
grant select, insert, update, delete on public.production_memberships to authenticated;

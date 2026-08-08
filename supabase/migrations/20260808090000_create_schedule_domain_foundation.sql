-- Phase 1 schedule-domain foundation.
--
-- This migration establishes stable relational identity, tenant boundaries,
-- optimistic versioning, and immutable schedule history around the existing
-- validated JSON schedule document. It does not connect the live Netlify app
-- to Supabase or migrate production data.

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  phase_type text not null default 'other'
    check (phase_type ~ '^[a-z][a-z0-9_-]{0,39}$'),
  position integer not null check (position between 0 and 1000000),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  constraint phases_production_fk
    foreign key (organization_id, production_id)
    references public.productions(organization_id, id) on delete restrict,
  constraint phases_org_production_id_unique
    unique (organization_id, production_id, id)
);

create unique index phases_production_position_active_idx
  on public.phases (production_id, position)
  where deleted_at is null;
create index phases_org_production_active_idx
  on public.phases (organization_id, production_id, position)
  where deleted_at is null;

create table public.production_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_id uuid not null,
  phase_id uuid,
  calendar_date date,
  day_number integer check (day_number is null or day_number between 1 and 1000000),
  day_type text not null default 'work'
    check (day_type ~ '^[a-z][a-z0-9_-]{0,39}$'),
  position integer not null check (position between 0 and 1000000),
  status text not null default 'planned'
    check (status in ('planned', 'confirmed', 'completed', 'cancelled')),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  constraint production_days_production_fk
    foreign key (organization_id, production_id)
    references public.productions(organization_id, id) on delete restrict,
  constraint production_days_phase_fk
    foreign key (organization_id, production_id, phase_id)
    references public.phases(organization_id, production_id, id) on delete restrict,
  constraint production_days_org_production_id_unique
    unique (organization_id, production_id, id)
);

create unique index production_days_position_active_idx
  on public.production_days (production_id, position)
  where deleted_at is null;
create unique index production_days_number_active_idx
  on public.production_days (production_id, day_number)
  where deleted_at is null and day_number is not null;
create unique index production_days_date_active_idx
  on public.production_days (production_id, calendar_date)
  where deleted_at is null and calendar_date is not null;
create index production_days_org_production_active_idx
  on public.production_days (organization_id, production_id, calendar_date, position)
  where deleted_at is null;

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_id uuid not null,
  production_day_id uuid not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  town text check (town is null or char_length(btrim(town)) between 1 and 160),
  document_schema_version integer not null default 1
    check (document_schema_version between 1 and 1000000),
  document jsonb not null default '{"meta":{},"rows":[]}'::jsonb,
  document_version bigint not null default 1 check (document_version > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  deleted_at timestamptz,
  constraint schedules_document_shape_check check (
    jsonb_typeof(document) = 'object'
    and document ? 'meta'
    and jsonb_typeof(document -> 'meta') = 'object'
    and document ? 'rows'
    and jsonb_typeof(document -> 'rows') = 'array'
  ),
  constraint schedules_document_size_check
    check (octet_length(document::text) <= 2097152),
  constraint schedules_production_fk
    foreign key (organization_id, production_id)
    references public.productions(organization_id, id) on delete restrict,
  constraint schedules_production_day_fk
    foreign key (organization_id, production_id, production_day_id)
    references public.production_days(organization_id, production_id, id) on delete restrict,
  constraint schedules_org_production_id_unique
    unique (organization_id, production_id, id)
);

create unique index schedules_slug_active_idx
  on public.schedules (production_id, slug)
  where deleted_at is null;
create index schedules_day_active_idx
  on public.schedules (production_day_id, status, updated_at desc)
  where deleted_at is null;
create index schedules_org_production_active_idx
  on public.schedules (organization_id, production_id, status, updated_at desc)
  where deleted_at is null;

create table public.schedule_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  production_id uuid not null,
  schedule_id uuid not null,
  version bigint not null check (version > 0),
  document_schema_version integer not null
    check (document_schema_version between 1 and 1000000),
  document jsonb not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  label text check (label is null or char_length(btrim(label)) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid references auth.users(id) on delete set null,
  constraint schedule_versions_document_shape_check check (
    jsonb_typeof(document) = 'object'
    and document ? 'meta'
    and jsonb_typeof(document -> 'meta') = 'object'
    and document ? 'rows'
    and jsonb_typeof(document -> 'rows') = 'array'
  ),
  constraint schedule_versions_document_size_check
    check (octet_length(document::text) <= 2097152),
  constraint schedule_versions_schedule_fk
    foreign key (organization_id, production_id, schedule_id)
    references public.schedules(organization_id, production_id, id) on delete restrict,
  constraint schedule_versions_schedule_version_unique
    unique (schedule_id, version)
);

create index schedule_versions_org_production_created_idx
  on public.schedule_versions (organization_id, production_id, created_at desc);
create index schedule_versions_schedule_created_idx
  on public.schedule_versions (schedule_id, version desc);

create or replace function public.protect_phase_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.production_id is distinct from old.production_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'phase identity fields cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and not public.is_org_admin(old.organization_id) then
    raise exception 'only an organization owner or admin may change phase deletion state';
  end if;

  new.version = old.version + 1;
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.protect_production_day_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.production_id is distinct from old.production_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'production day identity fields cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and not public.is_org_admin(old.organization_id) then
    raise exception 'only an organization owner or admin may change production day deletion state';
  end if;

  new.version = old.version + 1;
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.protect_schedule_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.production_id is distinct from old.production_id
    or new.created_at is distinct from old.created_at
    or new.created_by is distinct from old.created_by then
    raise exception 'schedule identity fields cannot be changed';
  end if;

  if new.deleted_at is distinct from old.deleted_at
    and not public.is_org_admin(old.organization_id) then
    raise exception 'only an organization owner or admin may change schedule deletion state';
  end if;

  if new.document_version is distinct from old.document_version then
    raise exception 'schedule document version must be current';
  end if;

  new.document_version = old.document_version + 1;
  new.updated_at = timezone('utc', now());
  new.updated_by = auth.uid();
  return new;
end;
$$;

create or replace function public.record_schedule_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_versions (
    organization_id,
    production_id,
    schedule_id,
    version,
    document_schema_version,
    document,
    checksum,
    created_by
  )
  values (
    new.organization_id,
    new.production_id,
    new.id,
    new.document_version,
    new.document_schema_version,
    new.document,
    pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(new.document::text, 'UTF8'), 'sha256'),
      'hex'
    ),
    coalesce(new.updated_by, new.created_by)
  );
  return new;
end;
$$;

create or replace function public.prevent_schedule_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'schedule versions are immutable';
end;
$$;

create trigger phases_protect_identity before update on public.phases
  for each row execute function public.protect_phase_identity();
create trigger production_days_protect_identity before update on public.production_days
  for each row execute function public.protect_production_day_identity();
create trigger schedules_protect_identity before update on public.schedules
  for each row execute function public.protect_schedule_identity();
create trigger schedules_record_version after insert or update on public.schedules
  for each row execute function public.record_schedule_version();
create trigger schedule_versions_prevent_update before update or delete on public.schedule_versions
  for each row execute function public.prevent_schedule_version_mutation();

revoke all on function public.protect_phase_identity() from public, anon, authenticated, service_role;
revoke all on function public.protect_production_day_identity() from public, anon, authenticated, service_role;
revoke all on function public.protect_schedule_identity() from public, anon, authenticated, service_role;
revoke all on function public.record_schedule_version() from public, anon, authenticated, service_role;
revoke all on function public.prevent_schedule_version_mutation() from public, anon, authenticated, service_role;

alter table public.phases enable row level security;
alter table public.production_days enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_versions enable row level security;

create policy phases_select_authorized
  on public.phases for select to authenticated
  using (
    public.can_access_production(production_id)
    and (deleted_at is null or public.is_org_admin(organization_id))
  );
create policy phases_insert_editors
  on public.phases for insert to authenticated
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );
create policy phases_update_editors
  on public.phases for update to authenticated
  using (deleted_at is null and public.can_edit_production(production_id))
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
  );

create policy production_days_select_authorized
  on public.production_days for select to authenticated
  using (
    public.can_access_production(production_id)
    and (deleted_at is null or public.is_org_admin(organization_id))
  );
create policy production_days_insert_editors
  on public.production_days for insert to authenticated
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );
create policy production_days_update_editors
  on public.production_days for update to authenticated
  using (deleted_at is null and public.can_edit_production(production_id))
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
  );

create policy schedules_select_authorized
  on public.schedules for select to authenticated
  using (
    public.can_access_production(production_id)
    and (deleted_at is null or public.is_org_admin(organization_id))
  );
create policy schedules_insert_editors
  on public.schedules for insert to authenticated
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );
create policy schedules_update_editors
  on public.schedules for update to authenticated
  using (deleted_at is null and public.can_edit_production(production_id))
  with check (
    public.can_edit_production(production_id)
    and public.is_active_org_member(organization_id)
  );

create policy schedule_versions_select_authorized
  on public.schedule_versions for select to authenticated
  using (
    public.can_access_production(production_id)
    and exists (
      select 1
      from public.schedules
      where schedules.id = schedule_versions.schedule_id
    )
  );

revoke all on table public.phases from public, anon, authenticated;
revoke all on table public.production_days from public, anon, authenticated;
revoke all on table public.schedules from public, anon, authenticated;
revoke all on table public.schedule_versions from public, anon, authenticated;

grant select, insert, update on table public.phases to authenticated;
grant select, insert, update on table public.production_days to authenticated;
grant select, insert, update on table public.schedules to authenticated;
grant select on table public.schedule_versions to authenticated;

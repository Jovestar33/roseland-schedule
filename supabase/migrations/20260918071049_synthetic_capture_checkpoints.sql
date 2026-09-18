-- Trusted all-store importer checkpoints; no public/API import privilege.
create table private.migration_capture_runs(
 id uuid primary key,organization_id uuid not null references public.organizations(id),
 source_environment text not null,source_epoch bigint not null check(source_epoch>0),
 capture_hash text not null check(capture_hash ~ '^[a-f0-9]{64}$'),
 capture jsonb not null,target_state jsonb not null,created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,source_environment,source_epoch)
);
alter table private.migration_capture_runs enable row level security;
revoke all on private.migration_capture_runs from public,anon,authenticated,service_role;
create trigger migration_capture_immutable before update or delete on private.migration_capture_runs for each row execute function public.prevent_schedule_version_mutation();
create trigger organization_write_guard before insert on private.migration_capture_runs for each row execute function private.guard_organization_write();

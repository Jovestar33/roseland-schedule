-- Immutable recovery for a real, non-frozen source capture. No API access or import RPC.
create table private.live_trial_imports (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 site_id uuid not null, origin text not null, capture_hash text not null check(capture_hash ~ '^[a-f0-9]{64}$'),
 plan_hash text not null check(plan_hash ~ '^[a-f0-9]{64}$'), authorized_by uuid not null references auth.users(id),
 manifest jsonb not null, decisions jsonb not null, created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,site_id), unique(organization_id,id)
);
create table private.live_trial_source_objects (
 run_id uuid not null references private.live_trial_imports(id), store text not null,
 key text not null, etag text not null, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 metadata jsonb not null, raw_bytes bytea not null,
 primary key(run_id,store,key),
 check(store in ('schedules','schedule-library','schedule-snapshots','schedule-templates','cms','production-index')),
 check(sha256=encode(extensions.digest(raw_bytes,'sha256'),'hex'))
);
create table private.schedule_template_legacy_origins (
 template_id uuid primary key, organization_id uuid not null, run_id uuid not null,
 source_store text not null default 'schedule-templates' check(source_store='schedule-templates'),
 source_key text not null, source_name text not null,
 foreign key(organization_id,template_id) references private.schedule_templates(organization_id,id),
 foreign key(organization_id,run_id) references private.live_trial_imports(organization_id,id),
 foreign key(run_id,source_store,source_key) references private.live_trial_source_objects(run_id,store,key)
);
create index live_trial_import_authorized_by on private.live_trial_imports(authorized_by);
create index template_legacy_source on private.schedule_template_legacy_origins(run_id,source_store,source_key);
create index template_legacy_run on private.schedule_template_legacy_origins(organization_id,run_id);
alter table private.live_trial_imports enable row level security;
alter table private.live_trial_source_objects enable row level security;
alter table private.schedule_template_legacy_origins enable row level security;
revoke all on private.live_trial_imports,private.live_trial_source_objects,private.schedule_template_legacy_origins from public,anon,authenticated,service_role;
create trigger live_trial_import_immutable before update or delete on private.live_trial_imports for each row execute function public.prevent_schedule_version_mutation();
create trigger live_trial_source_immutable before update or delete on private.live_trial_source_objects for each row execute function public.prevent_schedule_version_mutation();
create trigger template_legacy_origin_immutable before update or delete on private.schedule_template_legacy_origins for each row execute function public.prevent_schedule_version_mutation();

-- Shared legacy templates retain a verified cloud origin, never an invented source schedule.
-- Production read/export/edit/trash rules still apply; this does not publish to the organization.
create or replace function private.template_production_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if action is null or action not in ('read','edit','trash') then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or not private.schedule_actor_can(actor,case when action='read' and t.deleted_at is null then 'read' else 'edit' end,t.organization_id,t.production_id,null)
  or not private.schedule_actor_can(actor,'export',t.organization_id,t.production_id,null) then return false; end if;
 if (not exists(select 1 from private.schedule_template_sources where schedule_template_sources.template_id=t.id) and not exists(select 1 from private.schedule_template_browser_origins where schedule_template_browser_origins.template_id=t.id) and not exists(select 1 from private.schedule_template_legacy_origins x where x.template_id=t.id and x.organization_id=t.organization_id))
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id
   where x.template_id=t.id and (not private.schedule_actor_can(actor,'read',s.organization_id,s.production_id,s.id)
    or not private.schedule_actor_can(actor,'export',s.organization_id,s.production_id,s.id))) then return false; end if;
 if action='trash' and (private.schedule_context_denied(actor,'trash',t.organization_id,t.production_id,null,null)
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id where x.template_id=t.id
   and private.schedule_context_denied(actor,'trash',s.organization_id,s.production_id,s.id,null))) then return false; end if;
 return true;
end; $$;


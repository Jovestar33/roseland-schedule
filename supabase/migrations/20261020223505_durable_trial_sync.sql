-- Disabled until an organization Owner explicitly activates the reviewed mapping.
-- A machine lease is distinct from a user's session. It never invents auth.uid().
create table private.trial_sync_integrations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null unique references public.organizations(id),
 netlify_site_id uuid not null, legacy_origin text not null check(legacy_origin ~ '^https://[a-z0-9-]+[.]netlify[.]app$'),
 enabled boolean not null default false, revision bigint not null default 1,
 authorized_by uuid references auth.users(id), authorized_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 check(not enabled or (authorized_by is not null and authorized_at is not null))
);
create index trial_sync_authorizer on private.trial_sync_integrations(authorized_by);
create table private.trial_sync_mappings (
 id uuid primary key default gen_random_uuid(), integration_id uuid not null references private.trial_sync_integrations(id),
 schedule_id uuid not null unique references public.schedules(id), legacy_key text not null check(length(legacy_key) between 1 and 1000),
 state jsonb not null default '{"base":null,"guards":null,"pending":null,"status":"uninitialized"}',
 sequence bigint not null default 0, recovery_hash text,
 lease_token uuid, lease_until timestamptz, checked_at timestamptz, completed_at timestamptz,
 unique(integration_id,legacy_key),check(jsonb_typeof(state)='object'),check(octet_length(state::text)<=16777216)
);
create index trial_sync_claim_order on private.trial_sync_mappings(integration_id,checked_at,id);
create table private.trial_sync_checkpoints (
 mapping_id uuid not null references private.trial_sync_mappings(id),sequence bigint not null,
 state jsonb not null, checksum text not null, created_at timestamptz not null default clock_timestamp(),
 primary key(mapping_id,sequence)
);
create table private.trial_sync_writes (
 transaction_id bigint not null,schedule_id uuid not null references public.schedules(id),
 integration_id uuid not null references private.trial_sync_integrations(id),expected_version bigint not null,
 primary key(transaction_id,schedule_id)
);
create index trial_sync_write_integration on private.trial_sync_writes(integration_id);
alter table private.trial_sync_integrations enable row level security;
alter table private.trial_sync_mappings enable row level security;
alter table private.trial_sync_checkpoints enable row level security;
alter table private.trial_sync_writes enable row level security;
revoke all on private.trial_sync_integrations,private.trial_sync_mappings,private.trial_sync_checkpoints,private.trial_sync_writes from public,anon,authenticated,service_role;
create trigger trial_sync_checkpoint_immutable before update or delete on private.trial_sync_checkpoints for each row execute function public.prevent_schedule_version_mutation();

create function private.trial_sync_authorized(i private.trial_sync_integrations) returns boolean
language sql stable security definer set search_path='' as $$
 select i.enabled and private.organization_writable(i.organization_id)
 and private.organization_lifecycle_owner(i.authorized_by,i.organization_id);
$$;
-- Use the same policy lock as user mutations, without impersonating a session.
create function private.lock_trial_sync_integration(target_integration_id uuid) returns private.trial_sync_integrations
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;
begin
 select * into i from private.trial_sync_integrations where id=target_integration_id;
 if not found then raise sqlstate 'PT404' using message='Sync unavailable';end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||i.organization_id::text,0));
 perform 1 from public.organizations where id=i.organization_id for share;
 perform 1 from public.organization_memberships where organization_id=i.organization_id and user_id=i.authorized_by for share;
 select * into i from private.trial_sync_integrations where id=target_integration_id for share;
 if not coalesce(private.trial_sync_authorized(i),false) then raise sqlstate 'PT403' using message='Sync disabled';end if;
 return i;
end;$$;
create function public.set_trial_sync_enabled(target_integration_id uuid,expected_revision bigint,next_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;
begin
 perform public.require_active_schedule_session();perform private.require_recent_totp();
 select * into i from private.trial_sync_integrations where id=target_integration_id;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||i.organization_id::text,0));
 select * into i from private.trial_sync_integrations where id=target_integration_id for update;
 if not found or not private.organization_lifecycle_owner(auth.uid(),i.organization_id) then raise sqlstate 'PT404' using message='Sync unavailable';end if;
 if expected_revision is distinct from i.revision or next_enabled is null then raise sqlstate 'PT409' using message='Sync configuration changed';end if;
 if next_enabled then
  perform private.require_organization_writable(i.organization_id);
  if not exists(select 1 from private.trial_sync_mappings where integration_id=i.id)
   or exists(select 1 from private.trial_sync_mappings where integration_id=i.id and (state->'base' is null or state->'base'='null'::jsonb or state->'guards' is null or state->'guards'='null'::jsonb))
   then raise sqlstate 'PT409' using message='Verified initial mappings required';end if;
 end if;
 update private.trial_sync_integrations set enabled=next_enabled,revision=revision+1,authorized_by=auth.uid(),authorized_at=clock_timestamp() where id=i.id returning * into i;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(i.organization_id,auth.uid(),case when next_enabled then 'trial_sync.enabled' else 'trial_sync.disabled' end,'trial_sync',i.id,jsonb_build_object('revision',i.revision));
 return jsonb_build_object('id',i.id,'enabled',i.enabled,'revision',i.revision);
end;$$;

create function public.claim_trial_sync_mapping(target_integration_id uuid,claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;m private.trial_sync_mappings;
begin
 if claim_id is null then raise sqlstate 'PT400' using message='Claim required';end if;
 i:=private.lock_trial_sync_integration(target_integration_id);
 select * into m from private.trial_sync_mappings where integration_id=i.id
 and (lease_until is null or lease_until<clock_timestamp()) and (checked_at is null or checked_at<clock_timestamp()-interval '45 seconds') order by checked_at nulls first,id limit 1 for update skip locked;
 if not found then return jsonb_build_object('state','idle');end if;
 update private.trial_sync_mappings set lease_token=claim_id,lease_until=clock_timestamp()+interval '120 seconds',checked_at=clock_timestamp() where id=m.id returning * into m;
 return jsonb_build_object('state','claimed','mapping',jsonb_build_object('id',m.id,'netlifyKey',m.legacy_key,'supabaseId',m.schedule_id),
  'organizationId',i.organization_id,'legacyOrigin',i.legacy_origin,'netlifySiteId',i.netlify_site_id,'entry',m.state,'sequence',m.sequence,'leaseUntil',m.lease_until);
end;$$;
create function private.require_trial_sync_claim(target_mapping_id uuid,claim_id uuid) returns private.trial_sync_mappings
language plpgsql security definer set search_path='' as $$
declare m private.trial_sync_mappings;i private.trial_sync_integrations;
begin
 -- Consistent integration-before-mapping order matches activation and claim.
 select x.* into i from private.trial_sync_integrations x join private.trial_sync_mappings y on y.integration_id=x.id where y.id=target_mapping_id;
 i:=private.lock_trial_sync_integration(i.id);
 select * into m from private.trial_sync_mappings where id=target_mapping_id for update;
 if m.lease_token is distinct from claim_id or claim_id is null or m.lease_until is null or m.lease_until<=clock_timestamp() then raise sqlstate 'PT409' using message='Sync lease expired';end if;
 return m;
end;$$;
create function public.checkpoint_trial_sync(target_mapping_id uuid,claim_id uuid,expected_sequence bigint,next_state jsonb,release_claim boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare m private.trial_sync_mappings;recovery jsonb;fingerprint text;
begin
 m:=private.require_trial_sync_claim(target_mapping_id,claim_id);
 if expected_sequence is distinct from m.sequence then raise sqlstate 'PT409' using message='Sync checkpoint changed';end if;
 if next_state is null or jsonb_typeof(next_state)<>'object' or octet_length(next_state::text)>16777216 or not(next_state?'status') then raise sqlstate 'PT400' using message='Invalid sync checkpoint';end if;
 recovery:=next_state-array['checkedAt','syncedAt','status','error'];
 fingerprint:=encode(extensions.digest(convert_to(recovery::text,'UTF8'),'sha256'),'hex');
 if fingerprint is distinct from m.recovery_hash then
  insert into private.trial_sync_checkpoints(mapping_id,sequence,state,checksum)values(m.id,m.sequence+1,recovery,fingerprint);
 end if;
 update private.trial_sync_mappings set state=next_state,sequence=sequence+1,recovery_hash=fingerprint,
  lease_token=case when release_claim then null else lease_token end,lease_until=case when release_claim then null else lease_until end,
  completed_at=case when release_claim then clock_timestamp() else completed_at end where id=m.id;
 return m.sequence+1;
end;$$;

create function public.read_trial_sync_schedule(target_mapping_id uuid,claim_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.trial_sync_mappings;i private.trial_sync_integrations;s public.schedules;
begin
 m:=private.require_trial_sync_claim(target_mapping_id,claim_id);select * into i from private.trial_sync_integrations where id=m.integration_id;
 select * into s from public.schedules where id=m.schedule_id and organization_id=i.organization_id and deleted_at is null;
 if not found then raise sqlstate 'PT404' using message='Mapped schedule unavailable';end if;
 if not private.schedule_actor_can_without_template_bindings(i.authorized_by,'export',i.organization_id,s.production_id,s.id) or not private.schedule_template_bindings_allow(i.authorized_by,'export',i.organization_id,s.id) then raise sqlstate 'PT403' using message='Sync permission unavailable';end if;
 return to_jsonb(s);
end;$$;

-- A narrowly scoped transaction receipt allows only the mapped document update.
-- No artificial user session or user attribution is created for machine writes.
alter table public.schedules alter column updated_by drop not null;
alter table public.schedules add column last_sync_integration_id uuid references private.trial_sync_integrations(id);
create index schedules_sync_integration on public.schedules(last_sync_integration_id) where last_sync_integration_id is not null;
alter table public.schedules add constraint schedules_update_attribution check((updated_by is not null and last_sync_integration_id is null) or (updated_by is null and last_sync_integration_id is not null));
alter table public.schedule_versions add column sync_integration_id uuid references private.trial_sync_integrations(id);
create index schedule_versions_sync_integration on public.schedule_versions(sync_integration_id) where sync_integration_id is not null;
create function private.trial_sync_write_allowed(old_row public.schedules,new_row public.schedules) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from private.trial_sync_writes w join private.trial_sync_integrations i on i.id=w.integration_id
  where w.transaction_id=txid_current() and w.schedule_id=old_row.id and w.expected_version=old_row.document_version
   and i.organization_id=old_row.organization_id and private.trial_sync_authorized(i))
 and (to_jsonb(old_row)-array['document','document_schema_version','town'])=(to_jsonb(new_row)-array['document','document_schema_version','town']);
$$;
-- Preserve the existing permission/identity guards; add only the receipt path.
DO $$declare d text;begin
 d:=pg_get_functiondef('private.enforce_schedule_permissions()'::regprocedure);
 if position('begin' in d)=0 then raise exception 'Permission guard not recognized';end if;
 d:=regexp_replace(d,'begin','begin
 if tg_op=''UPDATE'' and private.trial_sync_write_allowed(old,new) then return new;end if;');execute d;
 d:=pg_get_functiondef('public.protect_schedule_identity()'::regprocedure);
 if position('new.updated_by = auth.uid();' in d)=0 then raise exception 'Identity guard not recognized';end if;
 -- Evaluate before the existing version increment changes new.document_version.
 d:=replace(d,'new.document_version = old.document_version + 1;',
  'if private.trial_sync_write_allowed(old,new) then
 select integration_id into new.last_sync_integration_id from private.trial_sync_writes where transaction_id=txid_current() and schedule_id=old.id;
 new.updated_by=null;
 else new.last_sync_integration_id=null;new.updated_by=auth.uid();end if;
 new.document_version = old.document_version + 1;');
 d:=replace(d,'new.updated_by = auth.uid();','');execute d;
 d:=pg_get_functiondef('public.record_schedule_version()'::regprocedure);
 if position('coalesce(new.updated_by,new.created_by)' in d)=0 then raise exception 'History guard not recognized';end if;
 d:=replace(d,'metadata,metadata_checksum)','metadata,metadata_checksum,sync_integration_id)');
 d:=replace(d,'coalesce(new.updated_by,new.created_by)','case when new.last_sync_integration_id is not null then null else coalesce(new.updated_by,new.created_by) end');
 d:=replace(d,'''sha256''),''hex''));','''sha256''),''hex''),new.last_sync_integration_id);');execute d;
end;$$;

create function public.write_trial_sync_schedule(target_mapping_id uuid,claim_id uuid,expected_version bigint,next_document jsonb,expected_guard jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m private.trial_sync_mappings;i private.trial_sync_integrations;s public.schedules;g jsonb;
begin
 m:=private.require_trial_sync_claim(target_mapping_id,claim_id);select * into i from private.trial_sync_integrations where id=m.integration_id;
 perform private.require_organization_writable(i.organization_id);
 select * into s from public.schedules where id=m.schedule_id and organization_id=i.organization_id and deleted_at is null for update;
 if not found then raise sqlstate 'PT404' using message='Mapped schedule unavailable';end if;
 g:=jsonb_build_object('production',s.production_id,'day',s.production_day_id,'phase',s.phase_id,'name',s.display_name,'slug',s.slug,'status',s.status,'position',s.library_position,
  'placement',jsonb_build_object('projectName',s.document->'meta'->'projectName','phase',s.document->'meta'->'phase','dayNumber',s.document->'meta'->'dayNumber','totalDays',s.document->'meta'->'totalDays'));
 if s.document_version is distinct from expected_version or g is distinct from expected_guard then raise sqlstate 'PT409' using message='Mapped schedule changed';end if;
 if ((s.document->'meta')-array['projectName','phase','dayNumber','totalDays']) is null
 or jsonb_build_array(s.document->'meta'->'projectName',s.document->'meta'->'phase',s.document->'meta'->'dayNumber',s.document->'meta'->'totalDays')
 is distinct from jsonb_build_array(next_document->'meta'->'projectName',next_document->'meta'->'phase',next_document->'meta'->'dayNumber',next_document->'meta'->'totalDays') then raise sqlstate 'PT409' using message='Placement review required';end if;
 perform private.validate_schedule_document(next_document,1);
 perform 1 from public.productions where id=s.production_id and organization_id=i.organization_id and deleted_at is null for share;
 if not found or not private.schedule_actor_can_without_template_bindings(i.authorized_by,'edit',i.organization_id,s.production_id,s.id) or not private.schedule_template_bindings_allow(i.authorized_by,'edit',i.organization_id,s.id) then raise sqlstate 'PT403' using message='Sync permission unavailable';end if;
 if s.production_day_id is not null then
  perform 1 from public.production_days where id=s.production_day_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT409' using message='Placement unavailable';end if;
 end if;
 if s.phase_id is not null then
  perform 1 from public.phases where id=s.phase_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT409' using message='Placement unavailable';end if;
 end if;
 insert into private.trial_sync_writes values(txid_current(),s.id,i.id,expected_version);
 update public.schedules set document=next_document,document_schema_version=1,town=nullif(btrim(next_document->'meta'->>'town'),'') where id=s.id and document_version=expected_version returning * into s;
 if not found then raise sqlstate 'PT409' using message='Mapped schedule changed';end if;
 delete from private.trial_sync_writes where transaction_id=txid_current() and schedule_id=s.id;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(i.organization_id,null,'trial_sync.document_received','schedule',s.id,jsonb_build_object('integration_id',i.id,'mapping_id',m.id,'version',s.document_version));
 return to_jsonb(s);
end;$$;

create function public.read_trial_sync_status(target_organization_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i private.trial_sync_integrations;
begin
 perform public.require_active_schedule_session();perform private.require_organization_mfa(target_organization_id);
 if not private.organization_lifecycle_owner(auth.uid(),target_organization_id) then raise sqlstate 'PT404' using message='Sync unavailable';end if;
 select * into i from private.trial_sync_integrations where organization_id=target_organization_id;
 if not found then return jsonb_build_object('configured',false);end if;
 return jsonb_build_object('configured',true,'id',i.id,'revision',i.revision,'enabled',i.enabled,'authorized',private.trial_sync_authorized(i),
 'mappings',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'schedule_id',m.schedule_id,'legacy_key',m.legacy_key,'status',m.state->>'status','error',m.state->>'error','checked_at',m.checked_at,'completed_at',m.completed_at) order by m.legacy_key),'[]') from private.trial_sync_mappings m where integration_id=i.id));
end;$$;
revoke all on function private.lock_trial_sync_integration(uuid),private.trial_sync_authorized(private.trial_sync_integrations),private.require_trial_sync_claim(uuid,uuid),private.trial_sync_write_allowed(public.schedules,public.schedules) from public,anon,authenticated,service_role;
revoke all on function public.set_trial_sync_enabled(uuid,bigint,boolean),public.read_trial_sync_status(uuid),public.claim_trial_sync_mapping(uuid,uuid),public.checkpoint_trial_sync(uuid,uuid,bigint,jsonb,boolean),public.read_trial_sync_schedule(uuid,uuid),public.write_trial_sync_schedule(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.set_trial_sync_enabled(uuid,bigint,boolean),public.read_trial_sync_status(uuid) to authenticated;
grant execute on function public.claim_trial_sync_mapping(uuid,uuid),public.checkpoint_trial_sync(uuid,uuid,bigint,jsonb,boolean),public.read_trial_sync_schedule(uuid,uuid),public.write_trial_sync_schedule(uuid,uuid,bigint,jsonb,jsonb) to service_role;
notify pgrst,'reload schema';

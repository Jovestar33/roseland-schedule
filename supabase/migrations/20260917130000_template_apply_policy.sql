-- Apply remains a local draft. Its eventual save atomically retains reviewed
-- source restrictions. Context snapshots avoid recursive schedule/template graphs.
create table private.schedule_template_bindings (
 schedule_id uuid not null references public.schedules(id) on delete restrict,
 template_id uuid not null references private.schedule_templates(id) on delete restrict,
 fingerprint text not null, contexts jsonb not null check(jsonb_typeof(contexts)='array'),
 primary key(schedule_id,template_id,fingerprint)
);
create table private.schedule_template_save_receipts (
 schedule_id uuid not null references public.schedules(id) on delete restrict,
 version bigint not null, actor_id uuid not null references auth.users(id) on delete restrict,
 fingerprint text not null, primary key(schedule_id,version)
);
alter table private.schedule_template_bindings enable row level security;
alter table private.schedule_template_save_receipts enable row level security;
revoke all on private.schedule_template_bindings,private.schedule_template_save_receipts from public,anon,authenticated,service_role;

create function private.template_contexts_allow(actor uuid,action text,org uuid,contexts jsonb)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare org_role text; prod_role text; prod_status text; c jsonb; rule jsonb;
begin
 select role::text into org_role from public.organization_memberships where organization_id=org and user_id=actor and status='active';
 if org_role is null then return false; end if;
 for c in select value from jsonb_array_elements(contexts) loop
  if not exists(select 1 from public.productions where id=(c->>'production')::uuid and organization_id=org and deleted_at is null) then return false; end if;
  select role::text,status::text into prod_role,prod_status from public.production_memberships where production_id=(c->>'production')::uuid and user_id=actor;
  if org_role='member' and (prod_status='suspended' or (coalesce((c->>'membership')::boolean,false) and prod_status is distinct from 'active')) then return false; end if;
  if prod_status is distinct from 'active' then prod_role:='viewer'; end if;
  for rule in select value from jsonb_array_elements(c->'restrictions') loop
   if (rule->>'user'=actor::text or rule->>'role' in ('everyone',org_role) or (org_role='member' and rule->>'role'=prod_role))
    and ((rule->'actions') ? action or (rule->'actions') ? 'read' or (rule->'actions') ? 'export') then return false; end if;
  end loop;
 end loop;
 return true;
end; $$;
create function private.schedule_template_bindings_allow(actor uuid,action text,org uuid,sched uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.schedule_template_bindings b where b.schedule_id=sched and not private.template_contexts_allow(actor,action,org,b.contexts));
$$;
alter function private.schedule_actor_can(uuid,text,uuid,uuid,uuid) rename to schedule_actor_can_without_template_bindings;
create function private.schedule_actor_can(actor uuid,action text,org uuid,prod uuid default null,sched uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.schedule_actor_can_without_template_bindings(actor,action,org,prod,sched)
  and (sched is null or action in ('permissions','discover') or private.schedule_template_bindings_allow(actor,action,org,sched));
$$;

create function private.template_apply_contexts(t private.schedule_templates)
returns jsonb language sql stable security definer set search_path='' as $$
 with origins as (
  select t.organization_id as org,t.production_id as prod,null::uuid as sched
  union all select s.organization_id,s.production_id,s.id from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id where x.template_id=t.id
 ), own as (
  select jsonb_build_object('production',o.prod,'membership',t.published_at is null,'restrictions',coalesce((select jsonb_agg(jsonb_build_object('role',r.subject_role,'user',r.subject_user_id,'actions',r.denied_actions) order by r.id)
   from public.schedule_restrictions r where r.organization_id=o.org and (r.production_id is null or r.production_id=o.prod) and (r.schedule_id is null or r.schedule_id=o.sched)),'[]'::jsonb)) as context from origins o
 ), inherited as (
  select c.value as context from private.schedule_template_sources x join private.schedule_template_bindings b on b.schedule_id=x.schedule_id cross join lateral jsonb_array_elements(b.contexts) c where x.template_id=t.id
 ), all_contexts as (select context from own union select context from inherited)
 select coalesce(jsonb_agg(context order by context::text),'[]'::jsonb) from all_contexts;
$$;
create function public.review_schedule_template_apply(target_template_id uuid,target_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.schedule_templates; s public.schedules; contexts jsonb;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Receiving schedule unavailable'; end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 select * into s from public.schedules where id=target_schedule_id for share;
 select * into t from private.schedule_templates where id=target_template_id;
 if t.id is null or t.organization_id<>s.organization_id or t.deleted_at is not null or s.deleted_at is not null
  or (t.published_at is null and t.production_id<>s.production_id)
  or not private.template_actor_can(auth.uid(),t.id,'read') or not private.schedule_actor_can(auth.uid(),'edit',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Template application unavailable'; end if;
 contexts:=private.template_apply_contexts(t);
 if not private.template_contexts_allow(auth.uid(),'edit',s.organization_id,contexts) then raise sqlstate 'PT404' using message='Template source restrictions prevent editing this copy'; end if;
 return jsonb_build_object('template',public.read_schedule_template(t.id),'policy',private.workflow_fingerprint(contexts),'target_id',s.id,'target_version',s.document_version);
end; $$;
create function public.save_schedule_with_templates(target_schedule_id uuid,expected_version bigint,next_document jsonb,schema_version integer,template_uses jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules; item jsonb; review jsonb; t private.schedule_templates; contexts jsonb; result jsonb;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 select * into s from public.schedules where id=target_schedule_id for update;
 if s.document_version is distinct from expected_version then raise sqlstate 'PT409' using message='Schedule changed; retain draft and review'; end if;
 if template_uses is null or jsonb_typeof(template_uses)<>'array' or jsonb_array_length(template_uses) not between 1 and 100 then raise sqlstate 'PT400' using message='Invalid template applications'; end if;
 for item in select value from jsonb_array_elements(template_uses) loop
  if jsonb_typeof(item)<>'object' or item-ARRAY['id','version','policy']<>'{}'::jsonb then raise sqlstate 'PT400' using message='Invalid template application'; end if;
  review:=public.review_schedule_template_apply((item->>'id')::uuid,s.id);
  if (review->'template'->>'version')::bigint is distinct from (item->>'version')::bigint or review->>'policy' is distinct from item->>'policy' then raise sqlstate 'PT409' using message='Template or source restrictions changed; retain draft and review'; end if;
  select * into t from private.schedule_templates where id=(item->>'id')::uuid;
  contexts:=private.template_apply_contexts(t);
  insert into private.schedule_template_bindings values(s.id,t.id,private.workflow_fingerprint(contexts),contexts) on conflict do nothing;
 end loop;
 result:=public.update_schedule_document(s.id,expected_version,next_document,schema_version);
 insert into private.schedule_template_save_receipts values(s.id,expected_version+1,auth.uid(),private.workflow_fingerprint(template_uses));
 return result;
end; $$;
create function public.check_schedule_template_save(target_schedule_id uuid,saved_version bigint,template_uses jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.schedules;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id;
 if not found or not private.schedule_actor_can(auth.uid(),'read',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Save result unavailable'; end if;
 return exists(select 1 from private.schedule_template_save_receipts where schedule_id=s.id and version=saved_version and actor_id=auth.uid() and fingerprint=private.workflow_fingerprint(template_uses));
end; $$;

-- Include inherited constraints in existing copy/move review fingerprints.
create or replace function private.schedule_policy_stamp(org uuid,prod uuid,sched uuid)
returns text language sql stable security definer set search_path='' as $$
 select private.workflow_fingerprint(jsonb_build_object('rules',(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]') from public.schedule_restrictions r where r.organization_id=org and (r.production_id is null or r.production_id=prod) and (r.schedule_id is null or r.schedule_id=sched)),
  'templates',(select coalesce(jsonb_agg(to_jsonb(b) order by template_id,fingerprint),'[]') from private.schedule_template_bindings b where schedule_id=sched)));
$$;

create or replace function private.template_publication_source_readable(actor uuid,source_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare s public.schedules; org_role text; prod_role text; prod_status text;
begin
 select * into s from public.schedules where id=source_id;
 if not found or s.deleted_at is not null then return false; end if;
 select m.role::text into org_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id
  where m.organization_id=s.organization_id and m.user_id=actor and m.status='active' and o.deleted_at is null;
 if org_role is null or not exists(select 1 from public.productions where id=s.production_id and deleted_at is null) then return false; end if;
 select role::text,status::text into prod_role,prod_status from public.production_memberships where production_id=s.production_id and user_id=actor;
 if org_role='member' and prod_status='suspended' then return false; end if;
 if prod_status is distinct from 'active' then prod_role:='viewer'; end if;
 if s.production_day_id is not null and not exists(select 1 from public.production_days d where d.id=s.production_day_id and d.deleted_at is null
  and (d.phase_id is null or exists(select 1 from public.phases p where p.id=d.phase_id and p.deleted_at is null))) then return false; end if;
 if not private.schedule_template_bindings_allow(actor,'read',s.organization_id,s.id) then return false; end if;
 return not exists(select 1 from public.schedule_restrictions r where r.organization_id=s.organization_id
  and (r.production_id is null or r.production_id=s.production_id) and (r.schedule_id is null or r.schedule_id=s.id)
  and (r.subject_user_id=actor or r.subject_role in ('everyone',org_role) or (org_role='member' and r.subject_role=prod_role))
  and r.denied_actions && array['read','export']::text[]);
end; $$;

create or replace function public.copy_schedule_to_production(target_schedule_id uuid,source_schedule_id uuid,source_version bigint,source_policy text,
 target_production_id uuid,target_day_id uuid,target_phase_id uuid,next_display_name text,next_slug text,next_document jsonb,schema_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;doc jsonb;fp text;
begin
 select * into s from public.schedules where id=source_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);
 perform private.lock_schedule_placement(target_production_id,target_day_id,target_phase_id);
 if not exists(select 1 from public.productions where id=target_production_id and organization_id=s.organization_id) then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 fp:=private.workflow_fingerprint(jsonb_build_array(source_schedule_id,source_version,source_policy,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug,next_document,schema_version));
 if exists(select 1 from private.schedule_copy_receipts where schedule_id=target_schedule_id) then
  if not exists(select 1 from private.schedule_copy_receipts where schedule_id=target_schedule_id and actor_id=auth.uid() and fingerprint=fp) or not public.schedule_visible(target_schedule_id,'read') then raise sqlstate 'PT404' using message='Copy unavailable';end if;
  return jsonb_build_object('id',target_schedule_id,'status','confirmed','version',1);
 end if;
 select * into s from public.schedules where id=source_schedule_id for share;
 if s.deleted_at is not null or not public.schedule_visible(s.id,'create') or not public.schedule_capability('create',target_production_id) then raise sqlstate 'PT404' using message='Copy unavailable';end if;
 if s.document_version is distinct from source_version or source_policy is distinct from private.transfer_stamp(s,target_production_id) then raise sqlstate 'PT409' using message='Source or permissions changed; review again';end if;
 doc:=private.destination_document(next_document,target_production_id,target_day_id,target_phase_id);
 perform public.create_schedule_in_production(target_schedule_id,target_production_id,target_day_id,target_phase_id,next_display_name,next_slug,doc,schema_version);
 insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
 select organization_id,target_production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by from public.schedule_restrictions where schedule_id=s.id;
 insert into private.schedule_template_bindings select target_schedule_id,template_id,fingerprint,contexts from private.schedule_template_bindings where schedule_id=s.id;
 if not public.schedule_visible(target_schedule_id,'edit') then raise sqlstate 'PT404' using message='Copy cannot preserve editable access';end if;
 insert into private.schedule_copy_receipts(schedule_id,actor_id,fingerprint) values(target_schedule_id,auth.uid(),fp);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(s.organization_id,auth.uid(),'schedule.copy','schedule',target_schedule_id,jsonb_build_object('source_id',s.id,'source_version',s.document_version));
 return jsonb_build_object('id',target_schedule_id,'status','confirmed','version',1);
end; $$;

create or replace function public.copy_schedule(target_schedule_id uuid,source_schedule_id uuid,source_version bigint,source_policy text,
 target_day_id uuid,next_display_name text,next_slug text,next_document jsonb,schema_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.schedules; d public.production_days; result jsonb;
begin
 select * into source from public.schedules where id=source_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 select * into d from public.production_days where id=target_day_id;
 if not found or d.organization_id<>source.organization_id then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 perform private.lock_schedule_permissions(source.organization_id,source.production_id);
 perform private.lock_schedule_permissions(d.organization_id,d.production_id);
 select * into source from public.schedules where id=source_schedule_id for share;
 if source.deleted_at is not null or not private.schedule_actor_can(auth.uid(),'create',source.organization_id,source.production_id,source.id)
  or not private.schedule_actor_can(auth.uid(),'create',d.organization_id,d.production_id,null) then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 if source_version is distinct from source.document_version or source_policy is distinct from private.schedule_policy_stamp(source.organization_id,source.production_id,source.id) then raise sqlstate 'PT409' using message='Source or permissions changed; review again'; end if;
 result:=public.create_schedule(target_schedule_id,target_day_id,next_display_name,next_slug,case when source.production_id<>d.production_id then private.destination_document(next_document,d.production_id,d.id,d.phase_id) else next_document end,schema_version);
 insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
 select organization_id,d.production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by
 from public.schedule_restrictions where schedule_id=source.id;
 insert into private.schedule_template_bindings select target_schedule_id,template_id,fingerprint,contexts from private.schedule_template_bindings where schedule_id=source.id;
 if not private.schedule_actor_can(auth.uid(),'edit',d.organization_id,d.production_id,target_schedule_id) then raise sqlstate 'PT404' using message='Copy cannot preserve editable access'; end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(source.organization_id,auth.uid(),'schedule.copy','schedule',target_schedule_id,jsonb_build_object('source_id',source.id,'source_version',source.document_version));
 insert into private.schedule_copy_receipts(schedule_id,actor_id,fingerprint)
 values(target_schedule_id,auth.uid(),private.workflow_fingerprint(jsonb_build_object('source',source_schedule_id,'source_version',source_version,'source_policy',source_policy,'day',target_day_id,'name',next_display_name,'slug',next_slug,'document',next_document)));
 return result;
end; $$;

revoke all on function private.template_contexts_allow(uuid,text,uuid,jsonb),private.schedule_template_bindings_allow(uuid,text,uuid,uuid),private.schedule_actor_can_without_template_bindings(uuid,text,uuid,uuid,uuid),private.schedule_actor_can(uuid,text,uuid,uuid,uuid),private.template_apply_contexts(private.schedule_templates) from public,anon,authenticated,service_role;
revoke all on function public.review_schedule_template_apply(uuid,uuid),public.save_schedule_with_templates(uuid,bigint,jsonb,integer,jsonb),public.check_schedule_template_save(uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.review_schedule_template_apply(uuid,uuid),public.save_schedule_with_templates(uuid,bigint,jsonb,integer,jsonb),public.check_schedule_template_save(uuid,bigint,jsonb) to authenticated;

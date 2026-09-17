-- Production-first reusable templates. No actual legacy/browser import or publication.
-- Template content retains source permission provenance across replacements.
create table private.schedule_templates (
 id uuid primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
 production_id uuid not null, name text not null check(length(btrim(name)) between 1 and 150),
 rows jsonb not null check(jsonb_typeof(rows)='array'), version bigint not null default 1 check(version>0),
 deleted_at timestamptz, created_by uuid not null references auth.users(id) on delete restrict,
 updated_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organization_id,production_id) references public.productions(organization_id,id) on delete restrict,
 unique(organization_id,id)
);
create unique index schedule_templates_active_name on private.schedule_templates(production_id,lower(btrim(name))) where deleted_at is null;
create table private.schedule_template_sources (
 template_id uuid not null, organization_id uuid not null, schedule_id uuid not null,
 primary key(template_id,schedule_id),
 foreign key(organization_id,template_id) references private.schedule_templates(organization_id,id) on delete restrict,
 foreign key(organization_id,schedule_id) references public.schedules(organization_id,id) on delete restrict
);
create table private.schedule_template_receipts (
 request_id uuid primary key, template_id uuid not null references private.schedule_templates(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 fingerprint text not null, result jsonb not null, created_at timestamptz not null default now()
);
alter table private.schedule_templates enable row level security;
alter table private.schedule_template_sources enable row level security;
alter table private.schedule_template_receipts enable row level security;
revoke all on private.schedule_templates,private.schedule_template_sources,private.schedule_template_receipts from public,anon,authenticated,service_role;

create function private.template_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates; org_role text; prod_role text;
begin
 if action is null or action not in ('read','edit','trash') then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or not private.schedule_actor_can(actor,case when action='read' and t.deleted_at is null then 'read' else 'edit' end,t.organization_id,t.production_id,null) then return false; end if;
 -- A reusable copy must never expand the source schedule audience. Keeping all
 -- provenance on replacement prevents laundering a restricted old template.
 if not exists(select 1 from private.schedule_template_sources where schedule_template_sources.template_id=t.id)
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id
   where x.template_id=t.id and (not private.schedule_actor_can(actor,'read',s.organization_id,s.production_id,s.id)
    or not private.schedule_actor_can(actor,'export',s.organization_id,s.production_id,s.id))) then return false; end if;
 if action='trash' then
  select role::text into org_role from public.organization_memberships where organization_id=t.organization_id and user_id=actor;
  select role::text into prod_role from public.production_memberships where production_id=t.production_id and user_id=actor;
  if exists(select 1 from public.schedule_restrictions r where r.organization_id=t.organization_id
   and (r.production_id is null or r.production_id=t.production_id)
   and (r.schedule_id is null or r.schedule_id in(select schedule_id from private.schedule_template_sources where schedule_template_sources.template_id=t.id))
   and (r.subject_user_id=actor or r.subject_role in ('everyone',org_role) or (org_role='member' and r.subject_role=prod_role))
   and 'trash'=any(r.denied_actions)) then return false; end if;
 end if;
 return true;
end; $$;

create function public.schedule_template_productions(target_organization_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'can_manage',private.schedule_actor_can(auth.uid(),'edit',p.organization_id,p.id,null)) order by p.name,p.id),'[]')
 from public.productions p where p.organization_id=target_organization_id and private.schedule_actor_can(auth.uid(),'read',p.organization_id,p.id,null);
$$;
create function public.list_schedule_templates(target_production_id uuid,include_deleted boolean default false,after_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select t.id,t.organization_id,t.production_id,t.name,t.version,t.deleted_at,t.updated_at,jsonb_array_length(t.rows) as row_count,
   private.template_actor_can(auth.uid(),t.id,'edit') as can_manage,private.template_actor_can(auth.uid(),t.id,'trash') as can_trash
  from private.schedule_templates t where t.production_id=target_production_id and ((t.deleted_at is not null)=include_deleted)
   and (after_id is null or t.id>after_id) and private.template_actor_can(auth.uid(),t.id,'read') order by t.id limit 100
 ) page;
$$;
create function public.read_schedule_template(target_template_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if not private.template_actor_can(auth.uid(),target_template_id,'read') then raise sqlstate 'PT404' using message='Template unavailable'; end if;
 select * into t from private.schedule_templates where id=target_template_id;
 return jsonb_build_object('id',t.id,'organization_id',t.organization_id,'production_id',t.production_id,'name',t.name,'version',t.version,'rows',t.rows,'deleted_at',t.deleted_at,
  'can_manage',private.template_actor_can(auth.uid(),t.id,'edit'),'can_trash',private.template_actor_can(auth.uid(),t.id,'trash'));
end; $$;

create function public.mutate_schedule_template(request_id uuid,target_template_id uuid,target_production_id uuid,expected_version bigint,
 operation text,next_name text default null,next_rows jsonb default null,source_schedule_id uuid default null,source_version bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; t private.schedule_templates; source public.schedules; fp text; receipt private.schedule_template_receipts; result jsonb; clean_rows jsonb;
begin
 select organization_id into org from public.productions where id=target_production_id;
 if org is null or auth.uid() is null then raise sqlstate 'PT404' using message='Template unavailable'; end if;
 perform private.lock_schedule_permissions(org,target_production_id);
 if request_id is null or target_template_id is null or expected_version is null or expected_version<0
  or operation is null or operation not in ('create','replace','rename','trash','restore') then raise sqlstate 'PT400' using message='Invalid template request'; end if;
 fp:=private.workflow_fingerprint(jsonb_build_object('template',target_template_id,'production',target_production_id,'version',expected_version,'operation',operation,'name',next_name,'rows',next_rows,'source',source_schedule_id,'source_version',source_version));
 select * into receipt from private.schedule_template_receipts where schedule_template_receipts.request_id=mutate_schedule_template.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.template_id<>target_template_id or receipt.fingerprint<>fp
   or not private.template_actor_can(auth.uid(),target_template_id,'read') then raise sqlstate 'PT404' using message='Template result unavailable'; end if;
  return receipt.result;
 end if;
 if not private.schedule_actor_can(auth.uid(),'edit',org,target_production_id,null) then raise sqlstate 'PT404' using message='Template unavailable'; end if;
 select * into t from private.schedule_templates where id=target_template_id for update;
 if operation='create' then
  if t.id is not null or expected_version<>0 then raise sqlstate 'PT409' using message='Template already exists; refresh'; end if;
 else
  if t.id is null or t.production_id<>target_production_id or not private.template_actor_can(auth.uid(),t.id,case when operation in ('trash','restore') then 'trash' else 'edit' end) then raise sqlstate 'PT404' using message='Template unavailable'; end if;
  if t.version<>expected_version then raise sqlstate 'PT409' using message='Template changed; refresh and review'; end if;
  if (operation='trash' and t.deleted_at is not null) or (operation='restore' and t.deleted_at is null) or (operation='replace' and t.deleted_at is not null) then raise sqlstate 'PT409' using message='Template state changed; refresh'; end if;
 end if;
 if operation in ('create','replace','rename','restore') then
  if next_name is null or length(btrim(next_name)) not between 1 and 150 or next_name ~ '[[:cntrl:]]' then raise sqlstate 'PT400' using message='Choose a template name of 1 to 150 characters'; end if;
 end if;
 if operation in ('create','replace') then
  if next_rows is null then raise sqlstate 'PT400' using message='Template rows required'; end if;
  perform private.validate_schedule_document(jsonb_build_object('meta','{}'::jsonb,'rows',next_rows),1);
  select * into source from public.schedules where id=source_schedule_id for share;
  if source.id is null or source.organization_id<>org or source.production_id<>target_production_id or source.deleted_at is not null
   or not private.schedule_actor_can(auth.uid(),'edit',org,target_production_id,source.id)
   or not private.schedule_actor_can(auth.uid(),'export',org,target_production_id,source.id) then raise sqlstate 'PT404' using message='Template source unavailable'; end if;
  if source.document_version is distinct from source_version then raise sqlstate 'PT409' using message='Source changed; reload and review'; end if;
  -- Legacy templates exclude automatically generated sun rows and preserve all
  -- remaining row fields. Apply retains the receiving schedule metadata.
  select coalesce(jsonb_agg(row.value order by row.ordinality),'[]') into clean_rows from jsonb_array_elements(next_rows) with ordinality row where coalesce((row.value->>'sunLocked')::boolean,false)=false;
 end if;
 begin
  if operation='create' then
   insert into private.schedule_templates(id,organization_id,production_id,name,rows,created_by,updated_by)
    values(target_template_id,org,target_production_id,btrim(next_name),clean_rows,auth.uid(),auth.uid());
  else
   update private.schedule_templates set name=case when operation='trash' then name else btrim(next_name) end,
    rows=case when operation='replace' then clean_rows else rows end,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp(),
    deleted_at=case when operation='trash' then clock_timestamp() when operation='restore' then null else deleted_at end where id=target_template_id;
  end if;
 exception when unique_violation then raise sqlstate 'PT409' using message='Template name is already in use; choose another name'; end;
 if operation in ('create','replace') then insert into private.schedule_template_sources(template_id,organization_id,schedule_id) values(target_template_id,org,source.id) on conflict do nothing; end if;
 select version into expected_version from private.schedule_templates where id=target_template_id;
 result:=jsonb_build_object('request_id',request_id,'id',target_template_id,'version',expected_version,'operation',operation,'confirmed',true);
 insert into private.schedule_template_receipts values(request_id,target_template_id,auth.uid(),fp,result,now());
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,auth.uid(),'template.'||operation,'schedule_template',target_template_id,jsonb_build_object('version',expected_version,'request_id',request_id));
 return result;
end; $$;

create function public.check_schedule_template_request(request_id uuid,target_production_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.schedule_template_receipts; org uuid;
begin
 select organization_id into org from public.productions where id=target_production_id;
 if org is null or auth.uid() is null then raise sqlstate 'PT404' using message='Template result unavailable'; end if;
 perform private.lock_schedule_permissions(org,target_production_id);
 select * into r from private.schedule_template_receipts where schedule_template_receipts.request_id=check_schedule_template_request.request_id and actor_id=auth.uid();
 if not found then return jsonb_build_object('confirmed',false); end if;
 if not exists(select 1 from private.schedule_templates where id=r.template_id and production_id=target_production_id) or not private.template_actor_can(auth.uid(),r.template_id,'read') then raise sqlstate 'PT404' using message='Template result unavailable'; end if;
 return r.result;
end; $$;
revoke all on function private.template_actor_can(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.schedule_template_productions(uuid),public.list_schedule_templates(uuid,boolean,uuid),public.read_schedule_template(uuid),public.mutate_schedule_template(uuid,uuid,uuid,bigint,text,text,jsonb,uuid,bigint),public.check_schedule_template_request(uuid,uuid) from public,anon,service_role;
grant execute on function public.schedule_template_productions(uuid),public.list_schedule_templates(uuid,boolean,uuid),public.read_schedule_template(uuid),public.mutate_schedule_template(uuid,uuid,uuid,bigint,text,text,jsonb,uuid,bigint),public.check_schedule_template_request(uuid,uuid) to authenticated;

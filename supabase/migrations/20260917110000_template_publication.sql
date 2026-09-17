-- Deliberate same-organization publication, authorized for production Organizers
-- and organization leadership. Publishing grants no source-schedule access.
alter table private.schedule_templates add column published_at timestamptz;
alter table private.schedule_templates add column published_by uuid references auth.users(id) on delete restrict;
alter table private.schedule_templates add constraint template_publication_pair check ((published_at is null)=(published_by is null));

-- Publication extends only the base template audience. Existing source denies
-- still bind every recipient. A member without a source-production role is a
-- Viewer for this projection only; a suspended source membership remains denied.
create function private.template_publication_source_readable(actor uuid,source_id uuid)
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
 return not exists(select 1 from public.schedule_restrictions r where r.organization_id=s.organization_id
  and (r.production_id is null or r.production_id=s.production_id) and (r.schedule_id is null or r.schedule_id=s.id)
  and (r.subject_user_id=actor or r.subject_role in ('everyone',org_role) or (org_role='member' and r.subject_role=prod_role))
  and r.denied_actions && array['read','export']::text[]);
end; $$;

-- Retain the production-only authorization contract for all writing and Trash.
alter function private.template_actor_can(uuid,uuid,text) rename to template_production_actor_can;
create function private.template_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if private.template_production_actor_can(actor,template_id,action) then return true; end if;
 if action is distinct from 'read' then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or t.published_at is null or t.deleted_at is not null
  or not exists(select 1 from public.productions where id=t.production_id and deleted_at is null)
  or not exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=t.organization_id and m.user_id=actor and m.status='active' and o.deleted_at is null)
  or not exists(select 1 from private.schedule_template_sources x where x.template_id=t.id)
  or exists(select 1 from private.schedule_template_sources x where x.template_id=t.id and not private.template_publication_source_readable(actor,x.schedule_id)) then return false; end if;
 -- Original production restrictions still bind after a contributing schedule moves.
 return not exists(select 1 from public.schedule_restrictions r where r.organization_id=t.organization_id and r.schedule_id is null
  and (r.production_id is null or r.production_id=t.production_id)
  and (r.subject_user_id=actor or r.subject_role='everyone' or r.subject_role=(select role::text from public.organization_memberships where organization_id=t.organization_id and user_id=actor)
   or ((select role::text from public.organization_memberships where organization_id=t.organization_id and user_id=actor)='member'
    and r.subject_role=coalesce((select role::text from public.production_memberships where production_id=t.production_id and user_id=actor and status='active'),'viewer')))
  and r.denied_actions && array['read','export']::text[])
  and not exists(select 1 from public.production_memberships where production_id=t.production_id and user_id=actor and status='suspended');
end; $$;

create function private.template_actor_can_publish(actor uuid,template_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select t.deleted_at is null and private.template_production_actor_can(actor,t.id,'edit')
  and private.schedule_actor_can(actor,'organize',t.organization_id,t.production_id,null)
  and (exists(select 1 from public.organization_memberships where organization_id=t.organization_id and user_id=actor and status='active' and role in ('owner','admin'))
   or exists(select 1 from public.production_memberships where production_id=t.production_id and user_id=actor and status='active' and role='organizer'))
 from private.schedule_templates t where t.id=template_id),false);
$$;

-- Any content/name change or Trash returns a published template to production
-- scope. Editors cannot silently publish later replacements through an old grant.
create function private.withdraw_changed_template_publication()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.rows is distinct from old.rows or new.name is distinct from old.name or new.deleted_at is distinct from old.deleted_at then
  new.published_at:=null; new.published_by:=null;
 end if;
 return new;
end; $$;
create trigger withdraw_changed_template_publication before update on private.schedule_templates for each row execute function private.withdraw_changed_template_publication();

create or replace function public.read_schedule_template(target_template_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if not private.template_actor_can(auth.uid(),target_template_id,'read') then raise sqlstate 'PT404' using message='Template unavailable'; end if;
 select * into t from private.schedule_templates where id=target_template_id;
 return jsonb_build_object('id',t.id,'organization_id',t.organization_id,'production_id',t.production_id,'name',t.name,'version',t.version,'rows',t.rows,'deleted_at',t.deleted_at,'published_at',t.published_at,
  'can_manage',private.template_actor_can(auth.uid(),t.id,'edit'),'can_trash',private.template_actor_can(auth.uid(),t.id,'trash'),'can_publish',private.template_actor_can_publish(auth.uid(),t.id));
end; $$;
create or replace function public.list_schedule_templates(target_production_id uuid,include_deleted boolean default false,after_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select t.id,t.organization_id,t.production_id,t.name,t.version,t.deleted_at,t.updated_at,t.published_at,jsonb_array_length(t.rows) as row_count,
   private.template_actor_can(auth.uid(),t.id,'edit') as can_manage,private.template_actor_can(auth.uid(),t.id,'trash') as can_trash,private.template_actor_can_publish(auth.uid(),t.id) as can_publish
  from private.schedule_templates t where t.production_id=target_production_id and ((t.deleted_at is not null)=include_deleted)
   and (after_id is null or t.id>after_id) and private.template_actor_can(auth.uid(),t.id,'read') order by t.id limit 100
 ) page;
$$;
create function public.list_organization_templates(target_organization_id uuid,after_id uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(page) order by id),'[]') from (
  select t.id,t.organization_id,t.production_id,p.name as production_name,t.name,t.version,t.deleted_at,t.updated_at,t.published_at,jsonb_array_length(t.rows) as row_count,
   private.template_actor_can(auth.uid(),t.id,'edit') as can_manage,private.template_actor_can(auth.uid(),t.id,'trash') as can_trash,private.template_actor_can_publish(auth.uid(),t.id) as can_publish
  from private.schedule_templates t join public.productions p on p.id=t.production_id
  where t.organization_id=target_organization_id and t.published_at is not null and t.deleted_at is null
   and (after_id is null or t.id>after_id) and private.template_actor_can(auth.uid(),t.id,'read') order by t.id limit 100
 ) page;
$$;
create function public.publish_schedule_template(request_id uuid,target_template_id uuid,target_production_id uuid,expected_version bigint,publish boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; t private.schedule_templates; fp text; receipt private.schedule_template_receipts; result jsonb;
begin
 select organization_id into org from public.productions where id=target_production_id;
 if org is null or auth.uid() is null then raise sqlstate 'PT404' using message='Template unavailable'; end if;
 perform private.lock_schedule_permissions(org,target_production_id);
 if request_id is null or target_template_id is null or expected_version is null or expected_version<1 or publish is null then raise sqlstate 'PT400' using message='Invalid publication request'; end if;
 fp:=private.workflow_fingerprint(jsonb_build_object('template',target_template_id,'production',target_production_id,'version',expected_version,'publication',publish));
 select * into receipt from private.schedule_template_receipts where schedule_template_receipts.request_id=publish_schedule_template.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.template_id<>target_template_id or receipt.fingerprint<>fp or not private.template_actor_can_publish(auth.uid(),target_template_id) then raise sqlstate 'PT404' using message='Template result unavailable'; end if;
  return receipt.result;
 end if;
 select * into t from private.schedule_templates where id=target_template_id for update;
 if not found or t.production_id<>target_production_id or not private.template_actor_can_publish(auth.uid(),t.id) then raise sqlstate 'PT404' using message='Template publication unavailable'; end if;
 if t.version<>expected_version then raise sqlstate 'PT409' using message='Template changed; refresh and review publication'; end if;
 if (t.published_at is not null)=publish then raise sqlstate 'PT409' using message='Publication state changed; refresh'; end if;
 update private.schedule_templates set published_at=case when publish then clock_timestamp() else null end,published_by=case when publish then auth.uid() else null end,
  version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=t.id;
 result:=jsonb_build_object('request_id',request_id,'id',t.id,'version',t.version+1,'operation',case when publish then 'publish' else 'unpublish' end,'confirmed',true);
 insert into private.schedule_template_receipts values(request_id,t.id,auth.uid(),fp,result,now());
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
  values(org,auth.uid(),'template.'||case when publish then 'publish' else 'unpublish' end,'schedule_template',t.id,jsonb_build_object('version',t.version+1,'request_id',request_id));
 return result;
end; $$;
revoke all on function private.template_publication_source_readable(uuid,uuid),private.template_actor_can(uuid,uuid,text),private.template_actor_can_publish(uuid,uuid),private.withdraw_changed_template_publication() from public,anon,authenticated,service_role;
revoke all on function public.list_organization_templates(uuid,uuid),public.publish_schedule_template(uuid,uuid,uuid,bigint,boolean) from public,anon,service_role;
grant execute on function public.list_organization_templates(uuid,uuid),public.publish_schedule_template(uuid,uuid,uuid,bigint,boolean) to authenticated;

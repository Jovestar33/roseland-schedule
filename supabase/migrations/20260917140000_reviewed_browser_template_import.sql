-- Explicit reviewed browser/file ownership assignment. Discovery never writes,
-- imports default to the chosen production, and original browser data is retained.
create table private.schedule_template_browser_origins (
 template_id uuid primary key references private.schedule_templates(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 source_name text not null, source_saved_at bigint not null, source_fingerprint text not null,
 created_at timestamptz not null default now()
);
alter table private.schedule_template_browser_origins enable row level security;
revoke all on private.schedule_template_browser_origins from public,anon,authenticated,service_role;

create or replace function private.template_production_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if action is null or action not in ('read','edit','trash') then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or not private.schedule_actor_can(actor,case when action='read' and t.deleted_at is null then 'read' else 'edit' end,t.organization_id,t.production_id,null)
  or not private.schedule_actor_can(actor,'export',t.organization_id,t.production_id,null) then return false; end if;
 if (not exists(select 1 from private.schedule_template_sources where schedule_template_sources.template_id=t.id) and not exists(select 1 from private.schedule_template_browser_origins where schedule_template_browser_origins.template_id=t.id))
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id
   where x.template_id=t.id and (not private.schedule_actor_can(actor,'read',s.organization_id,s.production_id,s.id)
    or not private.schedule_actor_can(actor,'export',s.organization_id,s.production_id,s.id))) then return false; end if;
 if action='trash' and (private.schedule_context_denied(actor,'trash',t.organization_id,t.production_id,null,null)
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id where x.template_id=t.id
   and private.schedule_context_denied(actor,'trash',s.organization_id,s.production_id,s.id,null))) then return false; end if;
 return true;
end; $$;

create or replace function private.template_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if private.template_production_actor_can(actor,template_id,action) then return true; end if;
 if action is distinct from 'read' then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or t.published_at is null or t.deleted_at is not null
  or not exists(select 1 from public.productions where id=t.production_id and deleted_at is null)
  or not exists(select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=t.organization_id and m.user_id=actor and m.status='active' and o.deleted_at is null)
  or (not exists(select 1 from private.schedule_template_sources x where x.template_id=t.id) and not exists(select 1 from private.schedule_template_browser_origins x where x.template_id=t.id))
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

create function public.import_browser_schedule_template(request_id uuid,target_template_id uuid,target_production_id uuid,next_name text,
 source_name text,source_rows jsonb,source_saved_at bigint,ownership_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid; fp text; receipt private.schedule_template_receipts; result jsonb; clean_rows jsonb;
begin
 select organization_id into org from public.productions where id=target_production_id;
 if org is null or auth.uid() is null then raise sqlstate 'PT404' using message='Template destination unavailable'; end if;
 perform private.lock_schedule_permissions(org,target_production_id);
 if request_id is null or target_template_id is null or ownership_confirmed is distinct from true or source_name is null or length(btrim(source_name)) not between 1 and 150
  or next_name is null or length(btrim(next_name)) not between 1 and 150 or next_name ~ '[[:cntrl:]]'
  or source_saved_at is null or source_saved_at<0 or source_saved_at>9007199254740991 or source_rows is null then raise sqlstate 'PT400' using message='Review the browser template, its ownership and destination'; end if;
 perform private.validate_schedule_document(jsonb_build_object('meta','{}'::jsonb,'rows',source_rows),1);
 fp:=private.workflow_fingerprint(jsonb_build_object('template',target_template_id,'production',target_production_id,'name',next_name,'source_name',source_name,'source_rows',source_rows,'source_saved_at',source_saved_at,'ownership_confirmed',ownership_confirmed));
 select * into receipt from private.schedule_template_receipts where schedule_template_receipts.request_id=import_browser_schedule_template.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.template_id<>target_template_id or receipt.fingerprint<>fp or not private.template_actor_can(auth.uid(),target_template_id,'read') then raise sqlstate 'PT404' using message='Template result unavailable'; end if;
  return receipt.result;
 end if;
 if not private.schedule_actor_can(auth.uid(),'edit',org,target_production_id,null) or not private.schedule_actor_can(auth.uid(),'export',org,target_production_id,null) then raise sqlstate 'PT404' using message='Template destination unavailable'; end if;
 select coalesce(jsonb_agg(row.value order by row.ordinality),'[]') into clean_rows from jsonb_array_elements(source_rows) with ordinality row where coalesce((row.value->>'sunLocked')::boolean,false)=false;
 begin
  insert into private.schedule_templates(id,organization_id,production_id,name,rows,created_by,updated_by) values(target_template_id,org,target_production_id,btrim(next_name),clean_rows,auth.uid(),auth.uid());
 exception when unique_violation then raise sqlstate 'PT409' using message='Template name or identity already exists; choose another name'; end;
 insert into private.schedule_template_browser_origins(template_id,actor_id,source_name,source_saved_at,source_fingerprint)
  values(target_template_id,auth.uid(),source_name,source_saved_at,private.workflow_fingerprint(jsonb_build_object('name',source_name,'rows',source_rows,'savedAt',source_saved_at)));
 result:=jsonb_build_object('request_id',request_id,'id',target_template_id,'version',1,'operation','import','confirmed',true);
 insert into private.schedule_template_receipts values(request_id,target_template_id,auth.uid(),fp,result,now());
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(org,auth.uid(),'template.import','schedule_template',target_template_id,jsonb_build_object('request_id',request_id,'source','reviewed browser or file','production_only',true));
 return result;
end; $$;
revoke all on function public.import_browser_schedule_template(uuid,uuid,uuid,text,text,jsonb,bigint,boolean) from public,anon,service_role;
grant execute on function public.import_browser_schedule_template(uuid,uuid,uuid,text,text,jsonb,bigint,boolean) to authenticated;

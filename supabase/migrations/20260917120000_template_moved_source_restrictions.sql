-- Template policy follows each source's current production while preserving the
-- template's own production restrictions. No role or schedule access is added.
create or replace function private.template_production_actor_can(actor uuid,template_id uuid,action text default 'read')
returns boolean language plpgsql stable security definer set search_path='' as $$
declare t private.schedule_templates;
begin
 if action is null or action not in ('read','edit','trash') then return false; end if;
 select * into t from private.schedule_templates where id=template_id;
 if not found or not private.schedule_actor_can(actor,case when action='read' and t.deleted_at is null then 'read' else 'edit' end,t.organization_id,t.production_id,null)
  or not private.schedule_actor_can(actor,'export',t.organization_id,t.production_id,null) then return false; end if;
 if not exists(select 1 from private.schedule_template_sources where schedule_template_sources.template_id=t.id)
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id
   where x.template_id=t.id and (not private.schedule_actor_can(actor,'read',s.organization_id,s.production_id,s.id)
    or not private.schedule_actor_can(actor,'export',s.organization_id,s.production_id,s.id))) then return false; end if;
 if action='trash' and (private.schedule_context_denied(actor,'trash',t.organization_id,t.production_id,null,null)
  or exists(select 1 from private.schedule_template_sources x join public.schedules s on s.id=x.schedule_id where x.template_id=t.id
   and private.schedule_context_denied(actor,'trash',s.organization_id,s.production_id,s.id,null))) then return false; end if;
 return true;
end; $$;
revoke all on function private.template_production_actor_can(uuid,uuid,text) from public,anon,authenticated,service_role;

-- Backup exports include readable schedules in Trash. Keep the existing
-- role, read/export restriction, Trash-management, MFA and template checks.
-- No permissions for editing or sharing deleted schedules are added.

CREATE OR REPLACE FUNCTION private.schedule_actor_can_without_template_bindings(actor uuid, action text, org uuid, prod uuid DEFAULT NULL::uuid, sched uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare org_role text; prod_role text; allowed boolean; s public.schedules;
begin
 if actor is null or action not in ('discover','read','history','edit','create','organize','trash','export','transfer','permissions','share') then return false; end if;
 select m.role::text into org_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id
  where m.organization_id=org and m.user_id=actor and m.status='active' and o.deleted_at is null;
 if org_role is null then return false; end if;
 if prod is not null then
  if not exists(select 1 from public.productions where id=prod and organization_id=org and deleted_at is null) then return false; end if;
  select role::text into prod_role from public.production_memberships where production_id=prod and user_id=actor and status='active';
 end if;
 if sched is not null then
  select * into s from public.schedules where id=sched and organization_id=org and production_id=prod;
  if not found then return false; end if;
  if s.phase_id is not null and not exists(select 1 from public.phases where id=s.phase_id and deleted_at is null) then return false;end if;
  if s.production_day_id is not null and not exists(select 1 from public.production_days d where d.id=s.production_day_id and d.deleted_at is null
    and (d.phase_id is null or exists(select 1 from public.phases p where p.id=d.phase_id and p.deleted_at is null))) then return false; end if;
 end if;
 allowed := case
  when action='permissions' then org_role in ('owner','admin')
  when action='discover' then true
  when org_role in ('owner','admin') then true
  when prod_role='organizer' then true
  when prod_role='editor' then action in ('read','history','edit','export','share')
  when prod_role='viewer' then action in ('read','history','export')
  else false end;
 if not allowed then return false; end if;
 if exists(select 1 from public.schedule_restrictions r where r.organization_id=org
  and (r.production_id is null or r.production_id=prod) and (r.schedule_id is null or r.schedule_id=sched)
  and (r.subject_user_id=actor or r.subject_role='everyone' or r.subject_role=org_role or (org_role='member' and r.subject_role=prod_role))
  and (action=any(r.denied_actions) or (action not in ('permissions','discover') and 'read'=any(r.denied_actions)))) then return false; end if;
 if sched is not null and s.deleted_at is not null and action <> 'permissions' then
  return action in ('read','history','trash','export') and private.schedule_actor_can(actor,'trash',org,prod,null)
    and not exists(select 1 from public.schedule_restrictions r where r.schedule_id=sched
      and (r.subject_user_id=actor or r.subject_role in ('everyone',org_role) or (org_role='member' and r.subject_role=prod_role))
      and 'trash'=any(r.denied_actions));
 end if;
 return true;
end; $function$

;

-- Exact copy acknowledgements must not depend on permission to inspect history.
create table private.schedule_copy_receipts (
 schedule_id uuid primary key references public.schedules(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 fingerprint text not null,
 created_at timestamptz not null default now()
);
revoke all on private.schedule_copy_receipts from public,anon,authenticated,service_role;
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
 result:=public.create_schedule(target_schedule_id,target_day_id,next_display_name,next_slug,next_document,schema_version);
 insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
 select organization_id,d.production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by
 from public.schedule_restrictions where schedule_id=source.id;
 if not private.schedule_actor_can(auth.uid(),'edit',d.organization_id,d.production_id,target_schedule_id) then raise sqlstate 'PT404' using message='Copy cannot preserve editable access'; end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(source.organization_id,auth.uid(),'schedule.copy','schedule',target_schedule_id,jsonb_build_object('source_id',source.id,'source_version',source.document_version));
 insert into private.schedule_copy_receipts(schedule_id,actor_id,fingerprint)
 values(target_schedule_id,auth.uid(),private.workflow_fingerprint(jsonb_build_object('source',source_schedule_id,'source_version',source_version,'source_policy',source_policy,'day',target_day_id,'name',next_display_name,'slug',next_slug,'document',next_document)));
 return result;
end; $$;
create function public.check_schedule_copy(target_schedule_id uuid,source_schedule_id uuid,source_version bigint,source_policy text,
 target_day_id uuid,next_display_name text,next_slug text,next_document jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select public.schedule_visible(target_schedule_id,'read') and exists(select 1 from private.schedule_copy_receipts r
  where r.schedule_id=target_schedule_id and r.actor_id=auth.uid() and r.fingerprint=private.workflow_fingerprint(jsonb_build_object('source',source_schedule_id,'source_version',source_version,'source_policy',source_policy,'day',target_day_id,'name',next_display_name,'slug',next_slug,'document',next_document)));
$$;
revoke all on function public.check_schedule_copy(uuid,uuid,bigint,text,uuid,text,text,jsonb) from public,anon,service_role;
grant execute on function public.check_schedule_copy(uuid,uuid,bigint,text,uuid,text,text,jsonb) to authenticated;
alter policy production_memberships_select on public.production_memberships using(public.can_access_production(production_id) and public.schedule_capability('read',production_id));

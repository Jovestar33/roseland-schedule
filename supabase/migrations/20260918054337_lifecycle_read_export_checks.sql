create function public.review_schedule_template_export(target_template_id uuid,target_schedule_id uuid)
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
  or not private.template_actor_can(auth.uid(),t.id,'read') or not private.schedule_actor_can(auth.uid(),'export',s.organization_id,s.production_id,s.id) then raise sqlstate 'PT404' using message='Template export unavailable'; end if;
 contexts:=private.template_apply_contexts(t);
 if not private.template_contexts_allow(auth.uid(),'export',s.organization_id,contexts) then raise sqlstate 'PT404' using message='Template source restrictions prevent export'; end if;
 return jsonb_build_object('template',public.read_schedule_template(t.id),'policy',private.workflow_fingerprint(contexts),'target_id',s.id,'target_version',s.document_version);
end; $$;
revoke all on function public.review_schedule_template_export(uuid,uuid) from public,anon,service_role;
grant execute on function public.review_schedule_template_export(uuid,uuid) to authenticated;
-- Meaningful recipient labels are returned only to an authorized active Super Admin.
do $$declare d text;begin
 d:=pg_get_functiondef('private.organization_lifecycle_result(uuid,uuid)'::regprocedure);
 d:=replace(d,'select event_id,recipient_id,event_kind,lifecycle_version,delivery_state,created_at from private.administration_notification_outbox',
 'select event_id,recipient_id,(select coalesce(p.display_name,u.email,''Super Admin'') from auth.users u left join public.profiles p on p.user_id=u.id where u.id=recipient_id) as recipient_name,event_kind,lifecycle_version,delivery_state,created_at from private.administration_notification_outbox');
 execute d;
end;$$;
notify pgrst,'reload schema';

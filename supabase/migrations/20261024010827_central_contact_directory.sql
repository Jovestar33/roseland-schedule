-- Central directory. Schedule-only snapshots remain attached to their original day.
create function public.organization_contact_directory(target_organization_id uuid,after_key text default '',search_text text default '',production_filter uuid default null,phase_filter uuid default null,type_filter text default '',scope_filter text default '',sort_by text default 'name')
returns jsonb language plpgsql security definer set search_path='' as $$
declare entries jsonb;destinations jsonb;
begin
 perform public.require_active_schedule_session();
 if not public.is_active_org_member(target_organization_id) or not public.mfa_organization_access(target_organization_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 with raw_entries as (
  select 'shared:'||c.id as key,c.id,c.contact,c.version,case when c.phase_id is not null then 'phase' when c.production_id is not null then 'production' else 'organization' end as scope,
   c.production_id,coalesce(p.name,'') as production,c.phase_id,coalesce(ph.name,'') as phase,null::uuid as schedule_id,''::text as schedule,
   case when c.production_id is null then public.is_org_admin(c.organization_id) and private.schedule_actor_can(auth.uid(),'edit',c.organization_id) else public.schedule_capability('organize',c.production_id) end as can_manage,
   (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'production_id',s.production_id,'phase_id',coalesce((select day.phase_id from public.production_days day where day.id=s.production_day_id),s.phase_id)) order by s.display_name),'[]') from public.schedules s where s.organization_id=c.organization_id and s.deleted_at is null and public.schedule_visible(s.id,'read') and exists(select 1 from jsonb_array_elements(coalesce(s.document->'meta'->'productionContacts','[]'))a where a->>'id'=c.id::text)) as used_in
  from private.contact_directory c left join public.productions p on p.id=c.production_id left join public.phases ph on ph.id=c.phase_id
  where c.organization_id=target_organization_id and c.archived_at is null and (c.production_id is null or p.deleted_at is null and public.schedule_capability('read',p.id)) and (c.phase_id is null or ph.deleted_at is null)
  union all
  select 'schedule:'||s.id||':'||(a->>'id'),null::uuid,a,null::bigint,'schedule',s.production_id,p.name,coalesce(d.phase_id,s.phase_id),coalesce(ph.name,''),s.id,s.display_name,false,jsonb_build_array(jsonb_build_object('id',s.id,'name',s.display_name,'production_id',s.production_id,'phase_id',coalesce((select day.phase_id from public.production_days day where day.id=s.production_day_id),s.phase_id)))
  from public.schedules s join public.productions p on p.id=s.production_id left join public.production_days d on d.id=s.production_day_id left join public.phases ph on ph.id=coalesce(d.phase_id,s.phase_id)
   cross join lateral jsonb_array_elements(coalesce(s.document->'meta'->'productionContacts','[]'))a
  where s.organization_id=target_organization_id and s.deleted_at is null and public.schedule_visible(s.id,'read') and not exists(select 1 from private.contact_directory c where c.organization_id=s.organization_id and c.id::text=a->>'id' and c.archived_at is null and (c.production_id is null or c.production_id=s.production_id))
  union all
  select 'row:'||s.id||':'||md5(rc.person::text),null::uuid,rc.person||jsonb_build_object('id','row-'||md5(rc.person::text)),null::bigint,'schedule',s.production_id,p.name,coalesce(d.phase_id,s.phase_id),coalesce(ph.name,''),s.id,s.display_name,false,jsonb_build_array(jsonb_build_object('id',s.id,'name',s.display_name,'production_id',s.production_id,'phase_id',coalesce(d.phase_id,s.phase_id)))
  from public.schedules s join public.productions p on p.id=s.production_id left join public.production_days d on d.id=s.production_day_id left join public.phases ph on ph.id=coalesce(d.phase_id,s.phase_id)
  cross join lateral (select distinct jsonb_build_object('type','location','name',btrim(a->>'contactName'),'role',coalesce(a->>'contactTitle',''),'phone',coalesce(a->>'contactPhone',''),'email',coalesce(a->>'contactEmail','')) as person from jsonb_array_elements(coalesce(s.document->'rows','[]'))a where coalesce(btrim(a->>'contactName'),'')<>'')rc
  where s.organization_id=target_organization_id and s.deleted_at is null and public.schedule_visible(s.id,'read')


 ), filtered as (
 select r.*,lower(case sort_by when 'production' then production when 'role' then contact->>'role' when 'type' then contact->>'type' else contact->>'name' end)||chr(31)||r.key as cursor
 from raw_entries r
 where (production_filter is null or r.production_id=production_filter or exists(select 1 from jsonb_array_elements(r.used_in) u where u->>'production_id'=production_filter::text))
 and (phase_filter is null or r.phase_id=phase_filter or exists(select 1 from jsonb_array_elements(r.used_in)u where u->>'phase_id'=phase_filter::text and (production_filter is null or u->>'production_id'=production_filter::text)))
 and (coalesce(type_filter,'')='' or contact->>'type'=type_filter)
 and (coalesce(scope_filter,'')='' or scope=scope_filter)
 and (coalesce(search_text,'')='' or strpos(lower(concat_ws(' ',contact->>'name',contact->>'company',contact->>'role',contact->>'department',contact->>'email',contact->>'phone',production,phase,schedule)),lower(search_text))>0)
 )select coalesce(jsonb_agg(to_jsonb(x) order by x.cursor),'[]') into entries from(select * from filtered where cursor>coalesce(after_key,'') order by cursor limit 101)x;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'can_manage',public.schedule_capability('organize',p.id),'phases',(select coalesce(jsonb_agg(jsonb_build_object('id',ph.id,'name',ph.name) order by ph.name),'[]') from public.phases ph where ph.production_id=p.id and ph.deleted_at is null))order by p.name),'[]') into destinations from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null and public.schedule_capability('read',p.id);
 return jsonb_build_object('entries',entries,'productions',destinations,'can_create_organization',public.is_org_admin(target_organization_id) and private.schedule_actor_can(auth.uid(),'edit',target_organization_id));
end;$$;
create function public.save_organization_contact(target_organization_id uuid,target_production_id uuid,target_phase_id uuid,target_contact_id uuid,next_contact jsonb,expected_version bigint,archive_contact boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare before private.contact_directory;saved private.contact_directory;
begin
 perform public.require_active_schedule_session();
 perform private.lock_schedule_permissions(target_organization_id,target_production_id);
 perform private.require_organization_writable(target_organization_id);
 if not public.mfa_organization_access(target_organization_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 if target_production_id is null then
  if target_phase_id is not null or not public.is_org_admin(target_organization_id) or not private.schedule_actor_can(auth.uid(),'edit',target_organization_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 else
  if not exists(select 1 from public.productions where id=target_production_id and organization_id=target_organization_id and deleted_at is null) or not public.schedule_capability('organize',target_production_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  if target_phase_id is not null and not exists(select 1 from public.phases where id=target_phase_id and production_id=target_production_id and organization_id=target_organization_id and deleted_at is null) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 end if;
 if target_contact_id is null or expected_version is not null and expected_version<1 or archive_contact is null then raise sqlstate 'PT400' using message='Invalid contact';end if;
 if not archive_contact then
  if jsonb_typeof(next_contact) is distinct from 'object' or next_contact->>'id' is distinct from target_contact_id::text or not coalesce(next_contact->>'type'=any(array['crew','cast','client','location','other']),false)
   or coalesce(length(btrim(next_contact->>'name')),0) not between 1 and 160
   or exists(select 1 from unnest(array['id','type','name','role','phone','email'])k where jsonb_typeof(next_contact->k) is distinct from 'string')
   or exists(select 1 from jsonb_each(next_contact)e where e.key<>all(array['id','type','name','role','phone','email','department','company']) or jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>1000) then raise sqlstate 'PT400' using message='Invalid contact';end if;
 end if;
 select * into before from private.contact_directory where id=target_contact_id for update;
 if before.id is not null and (before.organization_id<>target_organization_id or before.production_id is distinct from target_production_id or before.phase_id is distinct from target_phase_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 if before.archived_at is not null then
  if not archive_contact then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  saved:=before;
 elsif before.id is not null and not archive_contact and before.contact=next_contact then saved:=before;
 else
  if before.id is null and (expected_version is not null or archive_contact) or before.id is not null and before.version is distinct from expected_version then raise sqlstate 'PT409' using message='Contact changed';end if;
  if before.id is null then
   if (select count(*) from private.contact_directory where organization_id=target_organization_id and archived_at is null)>=5000 then raise sqlstate 'PT400' using message='Contact limit reached';end if;
   insert into private.contact_directory(id,organization_id,production_id,phase_id,contact,created_by) values(target_contact_id,target_organization_id,target_production_id,target_phase_id,next_contact,auth.uid()) returning * into saved;
  else
   update private.contact_directory set contact=case when archive_contact then contact else next_contact end,archived_at=case when archive_contact then now() else null end,version=version+1,updated_at=now() where id=target_contact_id returning * into saved;
  end if;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)values(target_organization_id,auth.uid(),case when archive_contact then 'contact.archive' when expected_version is null then 'contact.create' else 'contact.update' end,'contact_directory',saved.id,jsonb_build_object('version',saved.version));
 end if;
 return jsonb_build_object('id',saved.id,'version',saved.version,'archived',saved.archived_at is not null);
end;$$;
revoke all on function public.organization_contact_directory(uuid,text,text,uuid,uuid,text,text,text),public.save_organization_contact(uuid,uuid,uuid,uuid,jsonb,bigint,boolean) from public,anon,service_role;
grant execute on function public.organization_contact_directory(uuid,text,text,uuid,uuid,text,text,text),public.save_organization_contact(uuid,uuid,uuid,uuid,jsonb,bigint,boolean) to authenticated;
